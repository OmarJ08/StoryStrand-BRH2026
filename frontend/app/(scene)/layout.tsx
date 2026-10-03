import MapExperience from "@/components/map/MapExperience";
import { SceneProvider } from "@/components/map/SceneContext";

/** One persistent 3D scene shared by /map/* and /route, so it never remounts between them. */
export default function SceneLayout({ children }: LayoutProps<"/">) {
  return (
    <SceneProvider>
      {/* touch-none lives on the canvas only, so sheets and lists can still scroll by touch */}
      <div className="fixed inset-0 h-dvh w-full overflow-hidden">
        <MapExperience />
        {children}
      </div>
    </SceneProvider>
  );
}
