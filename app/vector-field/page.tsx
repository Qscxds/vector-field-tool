/**
 * Web shell route. The page body lives in components/VectorFieldApp so that other routes (the
 * embeddable /embed) can render the same application; /mcp and /widget are untouched.
 */
import { VectorFieldApp } from "@/components/VectorFieldApp";

export default function VectorFieldPage() {
  return <VectorFieldApp />;
}
