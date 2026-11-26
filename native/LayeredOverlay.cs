using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows.Forms;

sealed class LayeredOverlay : Form
{
    private const int Layered = 0x80000;
    private const int Transparent = 0x20;
    private const int ToolWindow = 0x80;
    private const int NoActivate = 0x08000000;

    private LayeredOverlay()
    {
        Text = "Rewrite+ transparent overlay";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var parameters = base.CreateParams;
            parameters.ExStyle |= Layered | Transparent | ToolWindow | NoActivate;
            return parameters;
        }
    }

    public static void Run()
    {
        using var window = new LayeredOverlay();
        _ = window.Handle;
        var input = new Thread(() => window.ReadFrames(Console.OpenStandardInput())) { IsBackground = true };
        input.Start();
        Application.Run();
    }

    private void ReadFrames(Stream stream)
    {
        using var reader = new BinaryReader(stream);
        try
        {
            while (true)
            {
                var origin = new Point { X = reader.ReadInt32(), Y = reader.ReadInt32() };
                var size = new Point { X = reader.ReadInt32(), Y = reader.ReadInt32() };
                if (size.X == 0 && size.Y == 0)
                {
                    Invoke(() => ShowWindow(Handle, 0 /* SW_HIDE */));
                    continue;
                }
                if (size.X < 1 || size.Y < 1 || size.X > 8192 || size.Y > 8192)
                    throw new InvalidDataException("Invalid frame size.");

                var pixels = new byte[checked(size.X * size.Y * 4)];
                stream.ReadExactly(pixels);
                Invoke(() => Present(origin, size, pixels));
            }
        }
        catch (EndOfStreamException)
        {
            // The pipe closes when the Electron companion exits, including after an abrupt shutdown.
            Environment.Exit(0);
        }
        catch (Exception error)
        {
            Console.Error.WriteLine($"Window presentation failed: {error.Message}");
            Environment.Exit(1);
        }
    }

    private void Present(Point origin, Point size, byte[] pixels)
    {
        var header = new BitmapHeader
        {
            Size = (uint)Marshal.SizeOf<BitmapHeader>(), Width = size.X, Height = -size.Y,
            Planes = 1, BitsPerPixel = 32,
        };
        IntPtr bitmap = CreateDIBSection(IntPtr.Zero, ref header, 0, out IntPtr bits, IntPtr.Zero, 0);
        if (bitmap == IntPtr.Zero) throw new Win32Exception();
        IntPtr dc = CreateCompatibleDC(IntPtr.Zero);
        if (dc == IntPtr.Zero)
        {
            DeleteObject(bitmap);
            throw new Win32Exception();
        }
        IntPtr old = SelectObject(dc, bitmap);
        try
        {
            Marshal.Copy(pixels, 0, bits, pixels.Length);
            var source = new Point();
            var blend = new Blend { ConstantAlpha = 255, AlphaFormat = 1 };
            if (!UpdateLayeredWindow(Handle, IntPtr.Zero, ref origin, ref size, dc, ref source, 0, ref blend, 2))
                throw new Win32Exception();
            ShowWindow(Handle, 4 /* SW_SHOWNOACTIVATE */);
        }
        finally
        {
            SelectObject(dc, old);
            DeleteDC(dc);
            DeleteObject(bitmap);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapHeader
    {
        public uint Size;
        public int Width, Height;
        public ushort Planes, BitsPerPixel;
        public uint Compression, ImageSize;
        public int XPixelsPerMeter, YPixelsPerMeter;
        public uint ColorsUsed, ColorsImportant;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Blend { public byte Operation, Flags, ConstantAlpha, AlphaFormat; }

    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UpdateLayeredWindow(IntPtr window, IntPtr destination, ref Point origin,
        ref Point size, IntPtr source, ref Point offset, uint colorKey, ref Blend blend, uint flags);
    [DllImport("gdi32.dll", SetLastError = true)]
    private static extern IntPtr CreateDIBSection(IntPtr dc, ref BitmapHeader header, uint usage,
        out IntPtr pixels, IntPtr section, uint offset);
    [DllImport("gdi32.dll", SetLastError = true)] private static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern IntPtr SelectObject(IntPtr dc, IntPtr handle);
    [DllImport("gdi32.dll")] private static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr handle);
}
