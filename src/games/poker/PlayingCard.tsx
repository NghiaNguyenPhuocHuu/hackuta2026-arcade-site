import { RED_SUITS, SUIT_GLYPH, type Card } from "../../../shared/poker";

export function PlayingCard({
  card,
  hidden = false,
  size = "md",
}: {
  card?: Card | null;
  hidden?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const face = card && !hidden ? card : null;
  const tone = face && RED_SUITS.has(face.suit) ? "red" : "ink";
  return (
    <div className={`poker-card poker-card--${size}${face ? "" : " poker-card--back"}`} data-tone={face ? tone : "back"}>
      {face ? (
        <>
          <span className="poker-card__corner poker-card__corner--nw">
            <span className="poker-card__rank">{face.rank}</span>
            <span className="poker-card__suit">{SUIT_GLYPH[face.suit]}</span>
          </span>
          <span className="poker-card__pip" aria-hidden="true">
            {SUIT_GLYPH[face.suit]}
          </span>
          <span className="poker-card__corner poker-card__corner--se">
            <span className="poker-card__rank">{face.rank}</span>
            <span className="poker-card__suit">{SUIT_GLYPH[face.suit]}</span>
          </span>
          <span className="poker-card__sr">
            {face.rank} of {face.suit}
          </span>
        </>
      ) : (
        <>
          <span className="poker-card__back-mark" aria-hidden="true" />
          <span className="poker-card__sr">Facedown card</span>
        </>
      )}
    </div>
  );
}
