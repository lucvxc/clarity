import { Link } from "react-router";

type Props = {
  subject: string;
  name: string;
  tagLine: string | null;
  level?: number | null;
  tier?: number | null;
  playerCardId?: string | null;
  className?: string;
};

function PlayerLink({ subject, name, tagLine, level, tier, playerCardId, className = "" }: Props) {
  const identity = { name, tagLine, level, tier, playerCardId };
  return (
    <Link
      className={`group/player min-w-0 truncate text-zinc-100 ${className}`}
      onClick={(event) => {
        event.stopPropagation();
        try {
          sessionStorage.setItem(`clarity:player:${subject}`, JSON.stringify(identity));
        } catch {}
      }}
      state={identity}
      to={`/player/${subject}/`}
    >
      <span className="relative inline-block max-w-full truncate align-bottom after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-current after:transition-transform after:duration-200 group-hover/player:after:scale-x-100 group-focus-visible/player:after:scale-x-100">
        {name}{tagLine && <span className="text-zinc-500">#{tagLine}</span>}
      </span>
    </Link>
  );
}

export default PlayerLink;
