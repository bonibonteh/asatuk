ASA TUK website (plain HTML, CSS and JavaScript, no build step)

VIEW:   double-click index.html
EDIT:   open this folder in VS Code and edit the .html files
PUBLISH: drag this whole folder onto netlify.com/drop, or upload it to GitHub Pages

PAGES
  index, about, events, projects, gallery, news, leadership, join, faq, contact
  thanks.html (shown after a form is sent) and 404.html (page not found)

FORMS AND EMAIL NOTIFICATIONS (Join + Contact)
  Both forms post to Formspree (https://formspree.io/f/xgavdqkb for Contact, and https://formspree.io/f/xppqwqqe for Join) and work on any host,
  including Netlify, GitHub Pages and an opened local file.
  Every registration or message is emailed to the address on your Formspree account and is
  also stored in the Formspree dashboard (Submissions, exportable to CSV).
  Registrations arrive with the subject "ASA TUK website: new membership registration";
  replying goes straight to the person who signed up.
  The first submission may ask you to confirm the form in Formspree. To change who gets the
  emails, edit the recipients in the Formspree form settings (no code change needed).
  If a visitor's connection fails, the form offers to open their email app instead.

EMAIL: replace asatuk@students.tukenya.ac.ke in the pages, and in the data-mailto
  attribute of the two forms (join.html, contact.html), with your real address.

CONTENT TO REPLACE (all marked TBC / sample)
  events.html      dates for each event
  leadership.html  names of both chapter councils (Architecture; Urban & Regional Planning, still TBC; duplicate a card for more people)
  projects.html    project cards
  news.html        posts (copy an <article class="post"> block)
  gallery.html     photos: put files in assets/photos/ and swap in an <img> (comment shows how)
  faq.html         answers, e.g. membership fee

FILES
  assets/style.css  base styles     assets/extra.css  nav, forms, new pages, animations
  assets/site.js    menu, animations, forms, lightbox     assets/search.js  site search
  Animations switch off automatically for visitors who prefer reduced motion.

SOCIAL LINKS
  Footer and Contact page. Edit the list at the bottom of assets/site.js.
  Instagram, TikTok and X are linked. Add URLs for Facebook, LinkedIn, YouTube, WhatsApp.

ASSETS
  Photos: assets/chairperson.jpeg (leadership page). Put gallery photos in assets/photos/.

ASA TUK STUDENT HUB (https://linktr.ee/asa_tuk)
  Nav pill (desktop + top of mobile menu), floating "Student Hub" button on mobile, footer link,
  homepage card + QR section (index.html #student-hub), and a compact banner on inner pages.
  QR files: assets/qr-asa-tuk-student-hub.svg (website) and .png (printing on posters).
  To change the link: search all .html files for linktr.ee/asa_tuk, then regenerate the QR code.
  Styles: bottom of assets/extra.css ("ASA TUK STUDENT HUB").

JOIN CONFIRMATION (welcome.html)
  After Formspree confirms a registration was saved, the student is sent to welcome.html,
  which shows the "Welcome to the ASA TUK Family" message with their first name.
  If saving fails, the form stays on the page with an error and the student can try again.
  The confirmation EMAIL to the student is NOT sent by this site's code. In Formspree, open the
  Join form (xppqwqqe) -> Settings -> Email notifications / Autoresponse and switch it on
  (it replies to the address in the form's "email" field; some Formspree plans only).
  Contact form still posts to the older endpoint and shows thanks.html.

LEADERSHIP (leadership.html)
  Architecture Chapter Council is split into dockets A-D; Urban & Regional Planning council below.
  A how-to-update comment sits at the top of the Architecture section.
