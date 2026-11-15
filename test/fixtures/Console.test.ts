// A test may print, since it is not the program, and it may set up a page from a string of HTML, which no user sees.
export function report(line: string) {
  console.log(line);
  document.body.innerHTML = `<p>${line}</p>`;
}
