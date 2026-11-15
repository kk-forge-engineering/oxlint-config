// A test may print, since it is not the program, and it may set up a page from a string of HTML, which no user sees.
// A native dialog is banned in a test as anywhere, so self.confirm is reported.
export function report(line: string): boolean {
  console.log(line);
  document.body.innerHTML = `<p>${line}</p>`;
  return self.confirm(line);
}
