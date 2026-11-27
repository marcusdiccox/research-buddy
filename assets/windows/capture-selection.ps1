$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
try {
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PipCapture {
 [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION data; }
 [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }
 [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int x,y; public uint data,flags,time; public UIntPtr extra; }
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
 [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
 [DllImport("user32.dll")] public static extern IntPtr GetClipboardOwner();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
 public static uint ProcessOf(IntPtr window) {uint process;GetWindowThreadProcessId(window,out process);return process;}
 [DllImport("user32.dll",SetLastError=true)] static extern uint SendInput(uint count, INPUT[] input, int size);
 public static bool Copy() { INPUT[] a=new INPUT[4]; ushort[] keys={0x11,0x43,0x43,0x11}; for(int i=0;i<4;i++){a[i].type=1;a[i].data.ki.vk=keys[i];a[i].data.ki.flags=(uint)(i>=2?2:0);} return SendInput(4,a,Marshal.SizeOf(typeof(INPUT)))==4; }
}
'@
} catch { [Console]::WriteLine('{"ready":false}'); exit }
function Get-PipCaptureResult {
$foreground = [PipCapture]::GetForegroundWindow()
$sourceProcess = [PipCapture]::ProcessOf($foreground)
$deadline = [DateTime]::UtcNow.AddSeconds(2)
do {
 $held = $false
 foreach($key in @(0x10,0x11,0x12,0x4e,0x5b,0x5c)) { if(([PipCapture]::GetAsyncKeyState($key) -band 0x8000) -ne 0){$held=$true} }
 if(-not $held){break}
 Start-Sleep -Milliseconds 15
} while([DateTime]::UtcNow -lt $deadline)
if($held){ @{error='keys_held'}|ConvertTo-Json -Compress; return }
if($foreground -ne [PipCapture]::GetForegroundWindow()) { @{error='foreground_changed'}|ConvertTo-Json -Compress; return }
$sequence = [PipCapture]::GetClipboardSequenceNumber()
if(-not [PipCapture]::Copy()){ @{error='copy_failed'}|ConvertTo-Json -Compress; return }
$deadline = [DateTime]::UtcNow.AddMilliseconds(1200)
do {
 Start-Sleep -Milliseconds 25
 if($foreground -ne [PipCapture]::GetForegroundWindow()){ @{error='foreground_changed'}|ConvertTo-Json -Compress; return }
 if([PipCapture]::GetClipboardSequenceNumber() -ne $sequence) {
  $readSequence=[PipCapture]::GetClipboardSequenceNumber()
  $owner=[PipCapture]::GetClipboardOwner()
  if($owner -eq [IntPtr]::Zero -or [PipCapture]::ProcessOf($owner) -ne $sourceProcess){ @{error='copy_failed'}|ConvertTo-Json -Compress; return }
  if([System.Windows.Forms.Clipboard]::ContainsText()) {
   $text=[System.Windows.Forms.Clipboard]::GetText()
   if($readSequence -ne [PipCapture]::GetClipboardSequenceNumber() -or $owner -ne [PipCapture]::GetClipboardOwner() -or $foreground -ne [PipCapture]::GetForegroundWindow()){ @{error='foreground_changed'}|ConvertTo-Json -Compress; return }
   if($text.Length -gt 200000){ @{error='too_long'}|ConvertTo-Json -Compress; return }
   @{fresh=$true;text=$text}|ConvertTo-Json -Compress; return
  }
 }
} while([DateTime]::UtcNow -lt $deadline)
@{error='no_selection'}|ConvertTo-Json -Compress
}
[Console]::WriteLine('{"ready":true}')
while(($command=[Console]::ReadLine()) -ne $null) {
 if($command -eq 'capture') { try { Get-PipCaptureResult } catch { @{error='copy_failed'}|ConvertTo-Json -Compress } }
}
