import { useMemo, useState } from 'react';
import type { LoadedPack } from '../../content/types';
import { isCustomPackId } from '../../custom/types';
import { useI18n } from '../../i18n/I18n';
import { choosePictures } from '../kid/layout';
import { Row, Screen, Segmented, Toggle } from './components';

const PER_PAGE = [4, 6, 9] as const;
type PerPage = (typeof PER_PAGE)[number];

/**
 * Printable cards from any pack, for play away from the screen: the picture, with the name in
 * Arabic and English underneath (or no names, for guessing games). Printed on A4 with dashed cut
 * lines; on a phone the print screen can save them as a PDF instead.
 */
export function Flashcards({
  packs,
  initialPackId,
  onBack,
}: {
  packs: readonly LoadedPack[];
  initialPackId?: string;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [packId, setPackId] = useState(packs.some((p) => p.id === initialPackId) ? initialPackId! : (packs[0]?.id ?? ''));
  const [perPage, setPerPage] = useState<PerPage>(6);
  const [names, setNames] = useState(true);
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const items = pack?.items ?? [];
  // One kind of picture for the whole pack, the same every time.
  const pictures = useMemo(() => choosePictures(items, () => 0), [items]);
  const pages = Array.from({ length: Math.ceil(items.length / perPage) }, (_, i) => items.slice(i * perPage, (i + 1) * perPage));

  return (
    <Screen title={t('flashcards')} onBack={onBack}>
      <p className="hint no-print">{t('flashcardsIntro')}</p>
      <div className="chips no-print" role="radiogroup" aria-label={t('settingsPack')}>
        {packs.map((p) => (
          <button
            type="button"
            key={p.id}
            role="radio"
            aria-checked={p.id === pack?.id}
            className={p.id === pack?.id ? 'chip on' : 'chip'}
            onClick={() => setPackId(p.id)}
          >
            {p.name[lang]}
            {isCustomPackId(p.id) ? ` (${t('myPackTag')})` : ''}
          </button>
        ))}
      </div>
      <section className="card no-print">
        <Row label={t('cardsPerPage')}>
          <Segmented
            label={t('cardsPerPage')}
            value={perPage}
            options={PER_PAGE.map((n) => ({ value: n, label: String(n) }))}
            onChange={setPerPage}
          />
        </Row>
        <Row label={t('cardNames')}>
          <Toggle label={t('cardNames')} checked={names} onChange={setNames} />
        </Row>
        <button type="button" className="btn primary wide big" onClick={() => window.print()} disabled={!items.length}>
          🖨️ {t('printCards')}
        </button>
        <p className="hint">{t('printHint', { n: pages.length })}</p>
      </section>

      <div className="print-area">
        {pages.map((page, i) => (
          <div className={`sheet per-${perPage}`} key={i}>
            {page.map((item) => (
              <div className="flashcard" key={item.key}>
                <img src={pictures[item.key]} alt="" />
                {names && (
                  <div className="card-names">
                    <span lang="ar" dir="rtl">
                      {item.name.ar}
                    </span>
                    <span lang="en" dir="ltr">
                      {item.name.en}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Screen>
  );
}
