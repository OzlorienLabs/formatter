"use client";

import type { CustomProps } from "../types";
import Sandbox from "./F-Sandbox";

export default function ThreePlayground(p: CustomProps) {
  return <Sandbox {...p} mode="three" />;
}
