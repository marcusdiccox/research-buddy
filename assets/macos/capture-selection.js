ObjC.import('AppKit');
ObjC.import('CoreGraphics');
function run() {
 try {
  const foreground = Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
  const end = Date.now()+2000;
  let held;
  do { held=[54,55,58,61,45,56,60,59,62].some(k=>$.CGEventSourceKeyState(0,k)); if(held) delay(.015); } while(held&&Date.now()<end);
  if(held) return JSON.stringify({error:'keys_held'});
  const unchanged=()=>Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier)===foreground;
  if(!unchanged()) return JSON.stringify({error:'foreground_changed'});
  const board=$.NSPasteboard.generalPasteboard, sequence=Number(board.changeCount);
  Application('System Events').keystroke('c',{using:['command down']});
  const deadline=Date.now()+1200;
  do { delay(.025);if(!unchanged())return JSON.stringify({error:'foreground_changed'});
   if(Number(board.changeCount)!==sequence){const value=board.stringForType($.NSPasteboardTypeString);if(value){const text=ObjC.unwrap(value);return JSON.stringify(text.length>200000?{error:'too_long'}:{fresh:true,text});}}
  }while(Date.now()<deadline);
  return JSON.stringify({error:'no_selection'});
 } catch(_) { return JSON.stringify({error:'copy_failed'}); }
}
