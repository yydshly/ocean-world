const nativeInputTags = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A', 'SUMMARY']);
const inputRoles = new Set(['button', 'link', 'textbox', 'combobox', 'slider', 'spinbutton',
  'listbox', 'option', 'menuitem', 'checkbox', 'radio', 'switch', 'tab']);

// Scene shortcuts must leave an interactive control's own keyboard behavior
// intact, including events whose target is a nested label, icon or text node.
export function oceanKeyboardTargetConsumesInput(target) {
  let element = target?.nodeType === 3 ? target.parentElement : target;
  while (element) {
    if (nativeInputTags.has(element.tagName?.toUpperCase()) || element.isContentEditable) return true;
    const editable = element.getAttribute?.('contenteditable');
    if (editable === '' || editable === 'true' || editable === 'plaintext-only') return true;
    if (inputRoles.has(element.getAttribute?.('role'))) return true;
    element = element.parentElement;
  }
  return false;
}
