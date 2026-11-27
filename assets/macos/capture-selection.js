ObjC.import('AppKit');
ObjC.import('CoreGraphics');
ObjC.import('ApplicationServices');
ObjC.import('CoreFoundation');
function captureSelection() {
  try {
    const foreground = Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier);
    const end = Date.now() + 2000;
    let held;
    do {
      held = [54, 55, 58, 61, 45, 56, 60, 59, 62].some((k) => $.CGEventSourceKeyState(0, k));
      if (held) delay(0.015);
    } while (held && Date.now() < end);
    if (held) return JSON.stringify({ error: 'keys_held' });
    const unchanged = () =>
      Number($.NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier) === foreground;
    if (!unchanged()) return JSON.stringify({ error: 'foreground_changed' });
    if (!$.AXIsProcessTrusted()) return JSON.stringify({ error: 'permission_required' });
    const target = $.AXUIElementCreateApplication(foreground);
    const attribute = (element, name) => {
      const value = Ref();
      if ($.AXUIElementCopyAttributeValue(element, $(name), value) !== 0 || !value[0])
        throw new Error('Unsupported selection');
      return value[0];
    };
    const window = attribute(target, 'AXFocusedWindow'),
      element = attribute(target, 'AXFocusedUIElement');
    const text = ObjC.unwrap(attribute(element, 'AXSelectedText'));
    if (typeof text !== 'string' || !text.trim()) return JSON.stringify({ error: 'no_selection' });
    if (text.length > 200000) return JSON.stringify({ error: 'too_long' });
    delay(0.025);
    if (
      !unchanged() ||
      !$.CFEqual(window, attribute(target, 'AXFocusedWindow')) ||
      !$.CFEqual(element, attribute(target, 'AXFocusedUIElement')) ||
      text !== ObjC.unwrap(attribute(element, 'AXSelectedText'))
    )
      return JSON.stringify({ error: 'foreground_changed' });
    return JSON.stringify({ fresh: true, text });
  } catch (_) {
    return JSON.stringify({ error: 'copy_failed' });
  }
}
function run() {
  const input = $.NSFileHandle.fileHandleWithStandardInput,
    output = $.NSFileHandle.fileHandleWithStandardOutput;
  const emit = (text) => output.writeData($(text + '\n').dataUsingEncoding($.NSUTF8StringEncoding));
  emit('{"ready":true}');
  let command = '';
  while (true) {
    const data = input.readDataOfLength(1);
    if (Number(data.length) === 0) break;
    const c = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
    if (c === '\n') {
      if (command === 'capture') emit(captureSelection());
      command = '';
    } else command += c;
  }
}
