/** The few strings the main process shows itself (native dialogs). */
import { readPrefs } from './prefs'

const TEXT = {
  en: {
    chooseFolderTitle: 'Choose where Tatabu keeps your files',
    chooseFolderButton: 'Use this folder',
    moveTitle: 'Move your files?',
    moveMessage: 'All application folders and library files will move to the new folder.',
    move: 'Move files',
    cancel: 'Cancel',
    chooseCvTitle: 'Choose your CV',
    cvFilter: 'CV (PDF or Word)',
    chooseDesignTitle: 'Choose the PDF of your designed CV',
    pdfFilter: 'PDF',
    chooseFilesTitle: 'Choose files to attach',
    documentsFilter: 'Documents and images',
    allFilesFilter: 'All files',
    startupErrorTitle: 'Tatabu could not start',
    databaseTooNew: 'Your data was saved by a newer version of Tatabu. Please install the latest version.',
    databaseError: 'Tatabu could not open its database.'
  },
  ar: {
    chooseFolderTitle: 'اختار وين يحفظ تتبع ملفاتك',
    chooseFolderButton: 'استخدم هالمجلد',
    moveTitle: 'ننقل ملفاتك؟',
    moveMessage: 'كل مجلدات الطلبات وملفات المكتبة رح تنتقل للمجلد الجديد.',
    move: 'انقل الملفات',
    cancel: 'إلغاء',
    chooseCvTitle: 'اختار سيرتك الذاتية',
    cvFilter: 'سيرة ذاتية (PDF أو Word)',
    chooseDesignTitle: 'اختار ملف PDF لسيرتك المصممة',
    pdfFilter: 'PDF',
    chooseFilesTitle: 'اختار ملفات لترفقها',
    documentsFilter: 'مستندات وصور',
    allFilesFilter: 'كل الملفات',
    startupErrorTitle: 'ما قدر تتبع يشتغل',
    databaseTooNew: 'بياناتك محفوظة بنسخة أحدث من تتبع. نزّل آخر نسخة لو سمحت.',
    databaseError: 'ما قدر تتبع يفتح قاعدة البيانات.'
  }
} as const

export function mainText() {
  return TEXT[readPrefs().language]
}
