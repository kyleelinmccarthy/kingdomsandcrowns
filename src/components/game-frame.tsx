import { cn } from "@/lib/utils";

type GameFrameProps = {
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  borderless?: boolean;
  children: React.ReactNode;
};

export function GameFrame({ title, icon, action, className, style, borderless, children }: GameFrameProps) {
  return (
    <div className={cn(borderless ? "game-frame--borderless" : "game-frame", className)} style={style}>
      {!borderless && (
        <>
          {/* Corner ornaments with faceted gems */}
          <div data-corner className="game-frame-corner game-frame-corner--tl" />
          <div data-corner className="game-frame-corner game-frame-corner--tr" />
          <div data-corner className="game-frame-corner game-frame-corner--bl" />
          <div data-corner className="game-frame-corner game-frame-corner--br" />
          {/* Edge midpoint decorations */}
          <div className="game-frame-edge game-frame-edge--top" />
          <div className="game-frame-edge game-frame-edge--bottom" />
          <div className="game-frame-edge game-frame-edge--left" />
          <div className="game-frame-edge game-frame-edge--right" />
        </>
      )}

      {title && (
        <div className="game-frame-header">
          {icon && <span className="game-frame-icon" role="img" aria-hidden="true">{icon}</span>}
          <span className="game-frame-title">{title}</span>
          {action && <div className="game-frame-action">{action}</div>}
        </div>
      )}

      <div className="game-frame-body">{children}</div>
    </div>
  );
}
