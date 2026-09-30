import type { Lang } from '../content/types';

export interface PolicySection {
  heading: string;
  body: string;
}

/**
 * Draft privacy policy (spec phase 9). The telemetry section only appears in builds that have a
 * telemetry endpoint; without one the feature does not exist.
 */
export function privacyPolicy(lang: Lang, telemetryAvailable: boolean): PolicySection[] {
  const text = lang === 'ar' ? AR : EN;
  return text.filter((s) => s.id !== 'telemetry' || telemetryAvailable).map(({ heading, body }) => ({ heading, body }));
}

const EN = [
  {
    id: 'summary',
    heading: 'In short',
    body: "Kids Sound Match is made for young children and collects as little as possible. There are no ads, no tracking and no accounts, and your child's results never leave this device.",
  },
  {
    id: 'none',
    heading: 'What we never collect',
    body: "No names, birthdays, photos, voice recordings, contacts, location or device identifiers. The app contains no advertising, analytics or tracking code and never loads anything from other companies' servers.",
  },
  {
    id: 'results',
    heading: "Your child's results stay on this device",
    body: 'For the Report, the app saves which animal was asked, whether your child found it on the first try, and how many taps it took. This is stored only in this browser on this device and is never sent anywhere. You can delete it at any time under Report → Clear all history.',
  },
  {
    id: 'pin',
    heading: 'Your PIN',
    body: 'Your parent PIN is stored on this device as a salted hash, never as the number itself.',
  },
  {
    id: 'telemetry',
    heading: 'Optional anonymous statistics (off unless you turn it on)',
    body: 'If you turn on "Help us improve" in Settings, the app sends anonymous results such as "cat, 3 pictures, Arabic, not found on the first try", with no names, IDs or dates, mixed together so they can\'t be linked to a single game. Like any internet request, an upload shows your network (IP) address to our server; the server is set up not to store it. Turning the option off deletes anything not yet sent.',
  },
  {
    id: 'offline',
    heading: 'Works offline',
    body: "After the first visit, the app's pictures and sounds are stored on this device so it works without the internet.",
  },
  {
    id: 'contact',
    heading: 'Contact',
    body: 'Contact details will be added before release.',
  },
];

const AR: typeof EN = [
  {
    id: 'summary',
    heading: 'باختصار',
    body: 'صُممت Kids Sound Match للأطفال الصغار وتجمع أقل قدر ممكن من البيانات. لا إعلانات ولا تتبّع ولا حسابات، ونتائج طفلك لا تغادر هذا الجهاز أبداً.',
  },
  {
    id: 'none',
    heading: 'ما لا نجمعه أبداً',
    body: 'لا أسماء ولا تواريخ ميلاد ولا صور ولا تسجيلات صوتية ولا جهات اتصال ولا موقع ولا معرّفات للجهاز. لا يحتوي التطبيق على أي شيفرة إعلانات أو تحليلات أو تتبّع، ولا يحمّل أي شيء من خوادم شركات أخرى.',
  },
  {
    id: 'results',
    heading: 'نتائج طفلك تبقى على هذا الجهاز',
    body: 'من أجل التقرير، يحفظ التطبيق الحيوان المطلوب، وهل وجده طفلك من أول محاولة، وعدد اللمسات. تُحفظ هذه البيانات في هذا المتصفح على هذا الجهاز فقط ولا تُرسل إلى أي مكان. يمكنك حذفها في أي وقت من التقرير ← مسح كل السجل.',
  },
  {
    id: 'pin',
    heading: 'الرمز السري',
    body: 'يُحفظ رمز الأهل على هذا الجهاز بشكل مُشفّر (تجزئة مع ملح)، ولا يُحفظ الرقم نفسه أبداً.',
  },
  {
    id: 'telemetry',
    heading: 'إحصاءات مجهولة اختيارية (متوقفة ما لم تفعّلها)',
    body: 'إذا فعّلت «ساعدنا على التحسين» في الإعدادات، يرسل التطبيق نتائج مجهولة مثل «قطة، 3 صور، العربية، لم يجدها من أول محاولة» دون أسماء أو معرّفات أو تواريخ، ومخلوطة بحيث لا يمكن ربطها بلعبة واحدة. وككل طلب عبر الإنترنت، يُظهر الإرسال عنوان شبكتك (IP) لخادمنا، والخادم مُعدّ لعدم حفظه. إيقاف الخيار يحذف كل ما لم يُرسل بعد.',
  },
  {
    id: 'offline',
    heading: 'يعمل دون إنترنت',
    body: 'بعد أول زيارة تُحفظ صور التطبيق وأصواته على هذا الجهاز ليعمل دون اتصال بالإنترنت.',
  },
  {
    id: 'contact',
    heading: 'التواصل',
    body: 'ستُضاف معلومات التواصل قبل الإصدار.',
  },
];
