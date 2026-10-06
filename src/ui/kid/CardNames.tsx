import type { LocalizedText } from '../../content/types';

/**
 * A picture's names on its card: English in the top left corner, Arabic in the bottom right,
 * sized to the card (big on a big card, still readable with 10 pictures). Settings can turn them off.
 */
export function CardNames({ name }: { name: LocalizedText }) {
  return (
    <>
      <span className="card-name en" lang="en" dir="ltr">
        {name.en}
      </span>
      <span className="card-name ar" lang="ar" dir="rtl">
        {name.ar}
      </span>
    </>
  );
}
