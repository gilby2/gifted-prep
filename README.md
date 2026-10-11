# מתאמנים למבחן המחוננים 🧠

אתר תרגול בעברית לילדים ולילדות בכיתה ב, להכנה למבחן המחוננים (שלב א).
השאלות נוצרות באופן אוטומטי ואינסופי בשלושה נושאים: חשבון, שפה והבנה, צורות וחשיבה.
האתר מתאים את רמת הקושי לכל ילד וילדה, חוזר על שאלות שהיו בהן טעויות, ומעודד בנקודות, ברצף ימים ובהישגים.

## מה יש באתר

- **היכרות** - בכניסה הראשונה הילד או הילדה כותבים שם ובוחרים "אני בן" או "אני בת". כל הטקסטים באתר פונים בלשון המתאימה.
- **אימון** - בלי שעון (אפשר להפעיל בהגדרות), משוב והסבר אחרי כל שאלה, ושאלות שהיו בהן טעויות חוזרות בהמשך.
  - **אימון מעורב** - האתר בוחר נושאים לפי מה שהכי כדאי לחזק ומה שלא תורגל זמן מה.
  - **אימון לפי נושא** - שלושה כרטיסי נושא עם פס התקדמות.
- **מבחן לדוגמה** - 15 שאלות קבועות מכל שלושת הנושאים (אפשר 10 או 20), פס זמן לכל שאלה (45 שניות כברירת מחדל), ובלי משוב באמצע.
  בסוף: ציון, זמן, פירוט לפי נושא, ומעבר על הטעויות עם התשובה הנכונה וההסבר. השאלות שהיו בהן טעויות נכנסות לתור החזרה של האימון.
- **שבחים** - גם על חשיבה ("איזה ראש!") וגם על מאמץ ודרך ("חשבת לאט ובדקת – מצוין!"), בלי לחזור על אותו משפט פעמיים ברצף.
- **הישגים** - תגים שנפתחים בדרך.
- **אזור הורים** - מוגן בתרגיל כפל. דיוק ורמה לכל מיומנות, 3 המיומנויות החלשות, גרף תרגול יומי,
  היסטוריית מבחנים לדוגמה (גרף וטבלה לפי נושא), הגדרות (שם, בן/בת, אורך מבחן, זמן לשאלה), גיבוי ושחזור התקדמות, ואיפוס.

ההתקדמות נשמרת בדפדפן (localStorage) בלבד. כדי לעבור למכשיר אחר: אזור הורים, "שמירת קובץ התקדמות", ואז "טעינת קובץ התקדמות" במכשיר השני.

## הרצה מקומית

אין צורך בהתקנה או בבנייה. צריך רק שרת קבצים סטטי (מודולים של JavaScript לא עובדים מ-`file://`):

```bash
python3 -m http.server 8000
```

ואז לפתוח בדפדפן: http://localhost:8000

## בדיקות

```bash
node tools/test_progress.mjs      # בדיקות למנוע ההתקדמות
node tools/validate.mjs           # מריץ כל מיומנות 1500 פעמים ובודק את חוזה השאלות
node tools/validate.mjs --skill math.add --runs 300
```

שתי הבדיקות רצות גם ב-GitHub Actions לפני כל פרסום. אם יש שגיאה, האתר לא יתפרסם.
`npm test` מריץ את שתיהן. אין תלויות, ו-`package.json` קיים רק כדי ש-node יטען את הקבצים כמודולים.

בדיקת קצה לקצה בדפדפן (לא חלק מ-CI, צריך Playwright מותקן):

```bash
python3 -m http.server 8765 --directory ..     # מגישים מתיקיית האב, כדי לבדוק כתובת עם תת-תיקייה
PLAYWRIGHT_DIR=/path/to/node_modules/playwright \
  node tools/e2e/e2e.mjs --base http://127.0.0.1:8765/gifted-prep/ --out /tmp/e2e
```

הבדיקה עוברת על כל המסכים, עונה על מאות שאלות, בודקת שגיאות, גלישה של תשובות, וסדר של תרגילים בתוך טקסט מימין לשמאל,
ושומרת צילומי מסך בשלושה גדלים. האפליקציה חושפת `window.__e2e` רק כשבכתובת יש `?e2e`.

## פרסום ב-GitHub Pages

1. לדחוף את הקוד לענף `main` במאגר ב-GitHub.
2. במאגר: **Settings → Pages → Build and deployment → Source**: לבחור **GitHub Actions**.
3. כל דחיפה ל-`main` מריצה את `.github/workflows/pages.yml`, שבודק ומפרסם את תיקיית השורש.
   הכתובת תופיע בלשונית Actions ובהגדרות Pages.

## הוספת שאלות

כל נושא הוא מודול ב-`js/generators/` (`math.js`, `verbal.js`, `shapes.js`). כל מיומנות היא פונקציה
`generate(rng, level)` שמחזירה שאלה. החוזה המלא נמצא ב-[CONTRACT.md](CONTRACT.md). בקצרה:

1. מוסיפים אובייקט מיומנות למערך `skills` של הנושא, עם `id` בצורה `topic.skill` ו-`name` בעברית.
2. משתמשים רק ב-`rng` שמתקבל (לא ב-`Math.random`), כדי שאותו seed ייתן אותה שאלה.
3. מחזירים `key` ייחודי לשאלה, `prompt`, ארבע `choices` שונות, ו-`answerIndex` (אחרי ערבוב עם `withChoices`).
4. מריצים `node tools/validate.mjs --skill <id>` ומתקנים עד שאין שגיאות.

למאגרי מילים ומשפטים (אנלוגיות, הבנת הנקרא) מוסיפים פריטים לקבצים ב-`js/generators/data/`.

## מבנה

```
index.html              דף יחיד
css/style.css           עיצוב (RTL, מותאם לטלפון, טאבלט ומחשב)
js/core/random.js       מחולל מספרים אקראיים עם seed
js/core/svg.js          עזרים לציור צורות
js/generators/          מחוללי השאלות לפי נושא + index.js (רישום)
js/app/progress.js      מנוע ההתקדמות (ללא DOM, נבדק ב-node)
js/app/main.js          המסכים והניווט
tools/                  בדיקות
```

---

## English summary

Static Hebrew (RTL) practice site for grade-2 children preparing for the Israeli gifted-children screening
test. A first-visit screen asks for the child's name and boy/girl; every child-facing phrase in `js/app`
has masculine and feminine forms (`[m, f]` pairs resolved by `genderText`). Vanilla ES modules, no build step, no runtime dependencies. Questions are procedurally generated
per skill from a seeded RNG; `js/app/progress.js` adapts the level per skill (up after 4 of the last 5
correct, down after 3 misses in a row), picks skills by weakness and staleness, avoids recently seen
questions (3000-key LRU), re-queues mistakes (a fresh variant and the exact question), and tracks
points, daily streak and badges in `localStorage` with JSON export/import. There are two modes: practice
(feedback and explanation after each question) and a test simulation (a fixed, topic-balanced set with a
per-question timer, no feedback until a results screen with a per-topic breakdown and a mistakes review;
the mistakes are then re-queued for practice and the result is kept in a test history for parents).

Run locally with `python3 -m http.server`; test with `node tools/test_progress.mjs` and
`node tools/validate.mjs`. Deploys to GitHub Pages via `.github/workflows/pages.yml`
(set Pages source to "GitHub Actions").
