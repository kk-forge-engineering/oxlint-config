// A component named like an SVG element, a member, another namespace and plain HTML are no inline SVG.
const Path = () => <span />;
const ns = { svg: () => <span /> };
export const icons = () => (
  <div>
    <Path />
    <ns.svg />
    <xlink:path />
    <span>text</span>
  </div>
);
