using System.ComponentModel;
using System.Runtime.InteropServices;

sealed class PopupWheel(IntPtr target, int virtualKey, Action<int> enqueue) : IDisposable
{
    private const int MouseHook = 14;
    private const uint MouseWheel = 0x020A;
    private Rect region;
    private IntPtr hook;
    private HookCallback? callback;
    private bool unavailable;

    // Call on the window thread, which also receives the low-level hook callbacks.
    public void SetRegion(Rect next)
    {
        region = next;
        if (next.Left >= next.Right || next.Top >= next.Bottom)
        {
            Dispose();
            return;
        }
        if (hook != IntPtr.Zero || unavailable) return;

        callback = OnMouse;
        hook = SetWindowsHookExW(MouseHook, callback, GetModuleHandleW(null), 0);
        if (hook == IntPtr.Zero)
        {
            unavailable = true;
            Console.Error.WriteLine($"Popup scrolling is unavailable: {new Win32Exception().Message}");
        }
    }

    private IntPtr OnMouse(int code, UIntPtr message, IntPtr data)
    {
        if (code == 0 && message.ToUInt32() == MouseWheel && Win32.GetForegroundWindow() == target &&
            (Win32.GetAsyncKeyState(virtualKey) & 0x8000) != 0)
        {
            var mouse = Marshal.PtrToStructure<MouseEvent>(data);
            var point = mouse.Position;
            int delta = unchecked((short)(mouse.Data >> 16));
            if (delta != 0 && point.X >= region.Left && point.X < region.Right &&
                point.Y >= region.Top && point.Y < region.Bottom)
            {
                // The tracker thread sends this to Electron. Never wait on the pipe here.
                enqueue(delta);
                return new IntPtr(1);
            }
        }
        return CallNextHookEx(hook, code, message, data);
    }

    public void Dispose()
    {
        region = default;
        if (hook != IntPtr.Zero && UnhookWindowsHookEx(hook))
        {
            hook = IntPtr.Zero;
            callback = null;
        }
    }

    private delegate IntPtr HookCallback(int code, UIntPtr message, IntPtr data);

    [StructLayout(LayoutKind.Sequential)]
    private struct MouseEvent
    {
        public Point Position;
        public uint Data, Flags, Time;
        public UIntPtr ExtraInfo;
    }

    [DllImport("user32.dll", ExactSpelling = true, SetLastError = true)]
    private static extern IntPtr SetWindowsHookExW(int type, HookCallback callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, UIntPtr message, IntPtr data);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern IntPtr GetModuleHandleW(string? moduleName);
}
