# Native pointer driver for Windows integration tests; never loaded by the app.
param([int]$X, [int]$Y, [switch]$Click, [int]$WheelDelta = 0)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class TestPointer {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [StructLayout(LayoutKind.Sequential)] public struct MouseInput { public int x; public int y; public uint data; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct Input { public uint type; public MouseInput mouse; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint count, Input[] input, int size);
  public static void Move(int x, int y) {
    var input=new Input[1]; input[0].mouse.flags=0xC001;
    input[0].mouse.x=(int)(((long)x-GetSystemMetrics(76))*65536/GetSystemMetrics(78));
    input[0].mouse.y=(int)(((long)y-GetSystemMetrics(77))*65536/GetSystemMetrics(79));
    if (SendInput(1,input,Marshal.SizeOf(typeof(Input))) != 1) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
  public static void Click() {
    var input = new Input[1]; input[0].mouse.flags=2;
    if (SendInput(1, input, Marshal.SizeOf(typeof(Input))) != 1) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    System.Threading.Thread.Sleep(100); input[0].mouse.flags=4;
    if (SendInput(1, input, Marshal.SizeOf(typeof(Input))) != 1) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
  public static void Wheel(int delta) {
    var input=new Input[1]; input[0].mouse.flags=0x800; input[0].mouse.data=unchecked((uint)delta);
    if(SendInput(1,input,Marshal.SizeOf(typeof(Input))) != 1) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
  }
}
'@
[void][TestPointer]::SetProcessDPIAware()
[TestPointer]::Move($X, $Y)
if ($Click) {
  Start-Sleep -Milliseconds 100
  [TestPointer]::Click()
}
if ($WheelDelta -ne 0) { Start-Sleep -Milliseconds 100; [TestPointer]::Wheel($WheelDelta) }
