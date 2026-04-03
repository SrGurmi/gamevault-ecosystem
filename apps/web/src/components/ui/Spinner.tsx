interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export const Spinner = ({ size = "md", label }: SpinnerProps) => {
  const sizeClass =
    size === "sm" ? "w-5 h-5" : size === "lg" ? "w-12 h-12" : "w-8 h-8";
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-slate-600">
      <div
        className={`${sizeClass} border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin`}
      />
      {label && <p className="text-sm font-medium">{label}</p>}
    </div>
  );
};
