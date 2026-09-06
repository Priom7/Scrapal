// Copy, with an outcome the reader can see either way. A copy button that does
// nothing visible leaves someone unsure whether it worked.
export async function copyText(
  text: string,
  title: string,
  detail: string,
  notify: (input: { title: string; detail?: string; tone?: 'error' }) => void,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    notify({ title, detail })
  } catch {
    notify({ tone: 'error', title: 'Could not copy', detail: 'Select the text and copy it manually.' })
  }
}
