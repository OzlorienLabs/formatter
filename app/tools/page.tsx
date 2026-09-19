import { Suspense } from "react";
import ToolIndex from "@/src/components/ToolIndex";

export const metadata = {
  title: "All tools — Formatter",
  description: "One hundred and twenty-five developer tools, every one of them running locally in your browser.",
};

export default function ToolsIndexPage() {
  return (
    <Suspense>
      <ToolIndex />
    </Suspense>
  );
}
