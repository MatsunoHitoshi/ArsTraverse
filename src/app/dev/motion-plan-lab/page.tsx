import { notFound } from "next/navigation";
import { MotionPlanLabClient } from "./motion-plan-lab-client";

export const metadata = {
  title: "GenerativeMotionPlan Lab",
};

export default function MotionPlanLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <MotionPlanLabClient />;
}
