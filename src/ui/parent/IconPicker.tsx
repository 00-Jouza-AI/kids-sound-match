import { ICONS } from '../../custom/imageTools';
import { useI18n } from '../../i18n/I18n';
import { Overlay } from './components';

/** Pick an icon instead of a photo: family, toys, food, clothes, things at home. */
export function IconPicker({ onPick, onClose }: { onPick: (icon: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Overlay label={t('iconsTitle')} onDismiss={onClose}>
      <h2>{t('iconsTitle')}</h2>
      <div className="icon-grid">
        {ICONS.map((icon) => (
          <button type="button" key={icon} className="icon-choice" onClick={() => onPick(icon)} aria-label={icon}>
            {icon}
          </button>
        ))}
      </div>
      <div className="pin-footer">
        <button type="button" className="btn ghost" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </Overlay>
  );
}
