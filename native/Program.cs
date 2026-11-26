using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

if (args.Length != 2 || (args[0] != "game" && !long.TryParse(args[0], out _)) ||
    !int.TryParse(args[1], out int virtualKey))
{
    Console.Error.WriteLine("Usage: Tracker <game|decimal harness HWND> <virtual key>");
    return 1;
}

// Desktop coordinates must stay physical across monitors with different DPI settings.
if (!Win32.SetProcessDpiAwarenessContext(new IntPtr(-4)))
{
    Console.Error.WriteLine($"Could not set per-monitor v2 DPI awareness ({Marshal.GetLastWin32Error()}).");
    return 1;
}

IntPtr target = args[0] == "game" ? Win32.FindRewriteWindow() : new IntPtr(long.Parse(args[0]));
if (target == IntPtr.Zero || !Win32.IsWindow(target))
{
    Console.Error.WriteLine("No visible Rewrite+ window or harness window was found.");
    return 1;
}

Win32.GetWindowThreadProcessId(target, out uint targetProcess);
if (Console.IsInputRedirected)
{
    var presentation = new Thread(LayeredOverlay.Run) { IsBackground = true };
    presentation.SetApartmentState(ApartmentState.STA);
    presentation.Start();
}
Snapshot? previous = null;
while (Win32.IsWindow(target))
{
    Win32.GetWindowThreadProcessId(target, out uint currentProcess);
    if (currentProcess != targetProcess) break;

    var origin = new Point();
    if (Win32.GetClientRect(target, out var rect) && Win32.ClientToScreen(target, ref origin))
    {
        bool foreground = Win32.GetForegroundWindow() == target;
        bool visible = Win32.IsWindowVisible(target) && !Win32.IsIconic(target);
        bool held = foreground && visible && (Win32.GetAsyncKeyState(virtualKey) & 0x8000) != 0;
        var cursor = new Point();
        if (held && !Win32.GetCursorPos(out cursor)) held = false;

        var snapshot = new Snapshot(origin.X, origin.Y, rect.Right, rect.Bottom,
            Win32.GetDpiForWindow(target), foreground, visible, held, cursor.X, cursor.Y);
        if (snapshot != previous)
        {
            Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(snapshot));
            previous = snapshot;
        }
    }

    Thread.Sleep(20);
}

return 0;

readonly record struct Snapshot(int X, int Y, int Width, int Height, uint Dpi,
    bool Foreground, bool Visible, bool Held, int CursorX, int CursorY);

[StructLayout(LayoutKind.Sequential)]
struct Point { public int X, Y; }

[StructLayout(LayoutKind.Sequential)]
struct Rect { public int Left, Top, Right, Bottom; }

static class Win32
{
    public static IntPtr FindRewriteWindow()
    {
        var candidates = new List<IntPtr>();
        EnumWindows((window, _) =>
        {
            if (!IsWindowVisible(window) || GetWindow(window, 4 /* GW_OWNER */) != IntPtr.Zero) return true;
            var title = new StringBuilder(256);
            if (GetWindowText(window, title, title.Capacity) == 0 ||
                !title.ToString().StartsWith("Rewrite+", StringComparison.Ordinal)) return true;

            GetWindowThreadProcessId(window, out uint id);
            try
            {
                using var process = Process.GetProcessById((int)id);
                if (process.ProcessName.Equals("SiglusEngine", StringComparison.OrdinalIgnoreCase)) candidates.Add(window);
            }
            catch (ArgumentException) { /* The process exited during enumeration. */ }
            catch (InvalidOperationException) { /* The process exited during enumeration. */ }
            return true;
        }, IntPtr.Zero);

        return candidates.Contains(GetForegroundWindow()) ? GetForegroundWindow()
            : candidates.Count == 1 ? candidates[0] : IntPtr.Zero;
    }

    private delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
}
