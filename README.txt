ASA TUK website (plain HTML, CSS and JavaScript, no build step)

VIEW:   double-click index.html
EDIT:   open this folder in VS Code and edit the .html files
PUBLISH: drag this whole folder onto netlify.com/drop, or upload it to GitHub Pages

PAGES
  index, about, events, projects, gallery, news, leadership, join, faq, contact, sip-and-paint
  partner.html (Partner With ASA TUK) and support.html (Support ASA TUK)
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
  news.html        posts (copy an <article class="post"> block). The launch post says "10 October 2026": edit that date and the datetime attribute if the launch day changes
  gallery.html     photos: put files in assets/photos/ and swap in an <img> (comment shows how)
  faq.html         answers, e.g. membership fee
  about.html       Mission and Vision (section id="mission-vision"): draft wording written from the page's own text, replace with the official statements if you have them

FILES
  assets/style.css  base styles     assets/extra.css  nav, forms, new pages, animations
  assets/site.js    mobile menu, membership + contact forms, lightbox, social links     assets/search.js  site search
  assets/motion.js  scroll reveals, parallax, count-up numbers     assets/forms.js  the three NEW forms     assets/config.js  their Formspree IDs
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
  Every portrait (president included) is the same square size; the grid is set in assets/extra.css ("people").
  Phones show two people per row.

LAYOUT NOTES
  The graph-paper grid is drawn only in the home hero and the page headers; content sections are plain colour.
  Phones and tablets (860px and below): the home hero sizes to its content (style.css, inside the 860px media query)
  instead of filling the whole screen, so the logo bar and the ASATUK heading sit close together.

NEWS SUBSCRIPTION, PARTNERSHIP ENQUIRY, SUPPORT ENQUIRY (three NEW forms, separate from membership)
  Where:  news.html#subscribe (also linked from the news page and the home page), partner.html#partner-form, support.html#support-form.
  Code:   assets/forms.js handles only forms marked data-form="...". The membership form (join.html) and the contact form are
          handled by assets/site.js (forms marked data-next) and are NOT touched by the new code. They never share an endpoint or a list.
  TO SWITCH THEM ON (needed once): create THREE new forms at formspree.io (one each, so the lists never mix), then paste each
          form ID into assets/config.js (subscribe, partner, support). Do NOT reuse the membership form's ID (xppqwqqe).
  Until an ID is pasted in, a visitor who presses the button gets their email app opened with the answers ready to send to
          asatuk@students.tukenya.ac.ke (nothing is lost, but nothing is stored either), so connect them before launch.
  Unsubscribing: the form promises "reply and ask to be removed". Remove people by hand from your Formspree submissions / mailing tool.
  Payments: this website takes NO payments and holds NO account or M-PESA details. The Support page is an enquiry form; the committee
          replies with ASA TUK's official payment details. Add a real payment link only when ASA TUK has an approved one.
  Partners and reports: partner.html (#partners) and support.html list categories with placeholders. Replace a placeholder only with
          an organisation that has agreed to be named, or with real reports. Nothing public is invented.

NEWS POSTS
  The 2026-2027 calendar post (9 Oct) was typed from the committee's calendar graphic. Nothing is listed for December or April, as on the graphic.
  The home page statistics (index.html, class "stats") count: 2 chapters, 4 council dockets, 9 events on the calendar, 3 site visits.
  Change the numbers in data-count and in the text beside it if the calendar or councils change.

MOTION (assets/motion.js + the "MOTION + IMAGES" block in assets/extra.css)
  Fade-and-rise text, image reveals, a very slow zoom plus a plain overlay on hover (mouse screens only), count-up numbers,
  gentle parallax on wide mouse screens only (add data-parallax="0.07" to a <figure> containing one <img> to use it), a smooth mobile menu,
  a soft first-visit logo arrival. Nothing loops and no lines are animated. Visitors who ask their device for reduced motion get the finished
  page with no movement. To turn parallax off, remove the data-parallax attribute and the "3. parallax" block in motion.js.

IMAGES
  gallery.html uses the real Sip & Paint photos (assets/sip/). Add new photos by copying a <figure class="tile"> block.
  projects.html uses original line drawings in assets/projects/*.svg as stand-ins (not photographs of real projects). Replace each
  src with a real project photo when you have one, and delete the sentence on the page that says they are illustrations.

NAVIGATION
  Ten links fit in one row from 1241px wide; below that the menu button appears (breakpoint 1240px in assets/extra.css and assets/site.js).
  The pages you listed as OPPORTUNITIES and RESOURCES do not exist yet and were not invented: add pages and links when you have the content.

