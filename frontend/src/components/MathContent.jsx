import "katex/dist/katex.min.css";
import { parseMathContent } from "../utils/mathContent";

export default function MathContent({ children }) {
  const segments = parseMathContent(children);
  return segments.map((segment, index) => {
    if (segment.type === "text") {
      return <span key={index}>{segment.content}</span>;
    }
    const Component = segment.type === "display-math" ? "div" : "span";
    return (
      <Component
        className="learning-rendered-math"
        dangerouslySetInnerHTML={{ __html: segment.html }}
        key={index}
      />
    );
  });
}
