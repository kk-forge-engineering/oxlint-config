// An API route answers in the server entrypoint's handler, which the server launcher starts.
export function GET() {
  return new Response("ok");
}
