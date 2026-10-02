import type { Lang } from '../content/types';

export interface PolicySection {
  heading: string;
  body: string;
}

/**
 * Draft privacy policy (spec phase 9). Optional features only appear in builds that have them:
 * the telemetry section needs a telemetry endpoint, the cloud section a Supabase project.
 */
export function privacyPolicy(lang: Lang, telemetryAvailable: boolean, cloudAvailable: boolean): PolicySection[] {
  const text = lang === 'ar' ? AR : EN;
  return text
    .filter((s) => (s.id !== 'telemetry' || telemetryAvailable) && (s.id !== 'cloud' || cloudAvailable))
    .map(({ heading, body }) => ({ heading, body }));
}

const EN = [
  {
    id: 'summary',
    heading: 'In short',
    body: "Kids Sound Match is made for young children and collects as little as possible. There are no ads, no tracking and no account is needed. Your child's results never leave this device.",
  },
  {
    id: 'none',
    heading: 'What we never collect',
    body: "The app never asks for your child's name, birthday or location, never reads your contacts or any device identifier, and contains no advertising, analytics or tracking code. The only photos and recordings in it are the ones you choose to add.",
  },
  {
    id: 'results',
    heading: "Your child's results stay on this device",
    body: 'For the Report, the app saves which item was asked, whether your child found it on the first try, and how many taps it took. This is stored only in this browser on this device and is never sent anywhere, not even with cloud backup. You can delete it at any time under Report → Clear all history.',
  },
  {
    id: 'words',
    heading: 'Words I know, and girl or boy',
    body: 'The words you mark as said, the words you add yourself, and whether a child is a girl or a boy (used only so the Arabic “Where’s your nose?” is grammatical) are saved on this device only. They are never backed up or sent anywhere, and removing a child deletes them.',
  },
  {
    id: 'own',
    heading: 'Your own pictures and recordings',
    body: 'Packs you make in My packs (photos, icons, your recordings and the names you type), and your own voice and photos for our packs, are saved on this device. Recording uses the microphone only while you press Record.',
  },
  {
    id: 'cloud',
    heading: 'Optional cloud backup (only if you sign in)',
    body: 'If you sign in with Google in My packs, the packs you make and your voice and photos for our packs are copied to a private storage space with Supabase, our storage provider, so you can use them on your other devices. Only your signed-in account can read them. We receive your Google email address to identify your account and use it for nothing else. "Delete my cloud data" in My packs removes everything from the cloud.',
  },
  {
    id: 'pin',
    heading: 'Your PIN',
    body: 'Your parent PIN is stored on this device as a salted hash, never as the number itself.',
  },
  {
    id: 'telemetry',
    heading: 'Optional anonymous statistics (off unless you turn it on)',
    body: 'If you turn on "Help us improve" in Settings, the app sends anonymous results for the built-in packs, such as "cat, 3 pictures, Arabic, not found on the first try", with no names, IDs or dates, mixed together so they can\'t be linked to a single game. Your own packs are never included. Like any internet request, an upload shows your network (IP) address to our server; the server is set up not to store it. Turning the option off deletes anything not yet sent.',
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
    body: 'صُممت Kids Sound Match للأطفال الصغار وتجمع أقل قدر ممكن من البيانات. لا إعلانات ولا تتبّع ولا حاجة إلى حساب، ونتائج طفلك لا تغادر هذا الجهاز أبداً.',
  },
  {
    id: 'none',
    heading: 'ما لا نجمعه أبداً',
    body: 'لا يطلب التطبيق اسم طفلك أو تاريخ ميلاده أو موقعه، ولا يقرأ جهات الاتصال أو أي معرّف للجهاز، ولا يحتوي على أي شيفرة إعلانات أو تحليلات أو تتبّع. الصور والتسجيلات الوحيدة فيه هي التي تختار إضافتها بنفسك.',
  },
  {
    id: 'results',
    heading: 'نتائج طفلك تبقى على هذا الجهاز',
    body: 'من أجل التقرير، يحفظ التطبيق العنصر المطلوب، وهل وجده طفلك من أول محاولة، وعدد اللمسات. تُحفظ هذه البيانات في هذا المتصفح على هذا الجهاز فقط ولا تُرسل إلى أي مكان، حتى مع النسخ الاحتياطي السحابي. يمكنك حذفها في أي وقت من التقرير ← مسح كل السجل.',
  },
  {
    id: 'words',
    heading: 'كلماتي، وبنت أم ولد',
    body: 'الكلمات التي تحدّدها كمنطوقة، والكلمات التي تضيفها بنفسك، وهل الطفل بنت أم ولد (لتكون جملة «أين أنفك؟» صحيحة لغوياً فقط) تُحفظ على هذا الجهاز وحده. لا تُنسخ احتياطياً ولا تُرسل إلى أي مكان، وحذف الطفل يحذفها.',
  },
  {
    id: 'own',
    heading: 'صورك وتسجيلاتك الخاصة',
    body: 'المجموعات التي تصنعها في «مجموعاتي» (الصور والرموز وتسجيلاتك والأسماء التي تكتبها)، وصوتك وصورك لمجموعاتنا، تُحفظ على هذا الجهاز. لا يُستخدم الميكروفون إلا أثناء ضغطك على «تسجيل».',
  },
  {
    id: 'cloud',
    heading: 'نسخ احتياطي سحابي اختياري (فقط إذا سجلت الدخول)',
    body: 'إذا سجلت الدخول باستخدام Google من «مجموعاتي»، تُنسخ المجموعات التي تصنعها وصوتك وصورك لمجموعاتنا إلى مساحة تخزين خاصة لدى Supabase، مزوّد التخزين لدينا، لتستخدمها على أجهزتك الأخرى. لا يقرؤها إلا حسابك بعد تسجيل الدخول. نتلقى عنوان بريدك في Google لتعريف حسابك فقط ولا نستخدمه لأي شيء آخر. يحذف زر «حذف بياناتي من السحابة» في «مجموعاتي» كل شيء من السحابة.',
  },
  {
    id: 'pin',
    heading: 'الرمز السري',
    body: 'يُحفظ رمز الأهل على هذا الجهاز بشكل مُشفّر (تجزئة مع ملح)، ولا يُحفظ الرقم نفسه أبداً.',
  },
  {
    id: 'telemetry',
    heading: 'إحصاءات مجهولة اختيارية (متوقفة ما لم تفعّلها)',
    body: 'إذا فعّلت «ساعدنا على التحسين» في الإعدادات، يرسل التطبيق نتائج مجهولة للمجموعات المدمجة مثل «قطة، 3 صور، العربية، لم يجدها من أول محاولة» دون أسماء أو معرّفات أو تواريخ، ومخلوطة بحيث لا يمكن ربطها بلعبة واحدة. لا تُضمَّن مجموعاتك الخاصة أبداً. وككل طلب عبر الإنترنت، يُظهر الإرسال عنوان شبكتك (IP) لخادمنا، والخادم مُعدّ لعدم حفظه. إيقاف الخيار يحذف كل ما لم يُرسل بعد.',
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
