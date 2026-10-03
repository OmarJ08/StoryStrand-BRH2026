import MapExperience from "@/components/map/MapExperience";

export default function MapLayout({ children }: LayoutProps<"/map">) {
  return (
    <div className="fixed inset-0 h-dvh w-full touch-none overflow-hidden">
      <MapExperience />
      {children}
    </div>
  );
}
