/* ASA TUK: connections for the three NEW forms (news subscription, partnership enquiry, support enquiry).
   This file does NOT affect the membership form (join.html), which has its own settings.

   HOW TO CONNECT A FORM
   1. Create a new form at formspree.io for each one below (use a separate form for each, so the lists never mix).
   2. Paste the form ID (the part after /f/ in its URL, e.g. xabcdefg) between the quotes.
   3. Commit the change. No other edit is needed.

   Until an ID is added, that form opens the visitor's email app with their message ready to send to the committee,
   so nothing is lost. These IDs are public by design. Never put passwords, API keys or payment details in this file. */
window.ASA_FORMS={
  subscribe:"",   /* news subscription  */
  partner:"",     /* partnership enquiry */
  support:""      /* support / donation enquiry */
};
