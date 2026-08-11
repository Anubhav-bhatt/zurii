/**
 * Real Zurii business details, in one place.
 *
 * Every value here was already present in the project — the phones and address
 * in Footer.jsx, the email and website in ContactUs.jsx, the WhatsApp number in
 * TripDetailPage.jsx. Nothing is invented: the previous footer also rendered
 * Facebook, Twitter and YouTube icons pointing at `#`, so those are omitted
 * rather than presented as working profiles.
 */

export const SITE = {
  name: 'Zurii',
  legalName: 'Zurii Travels',
  tagline: 'Your Dream Destination Solution',

  email: { label: 'zuriitravels@gmail.com', href: 'mailto:zuriitravels@gmail.com' },

  website: { label: 'sales.zuriitravels.com', href: 'https://sales.zuriitravels.com' },

  mapsUrl: 'https://maps.google.com/?q=Bemina+Hamdaniya+Colony+Sector+D+190018',

  phones: [
    { label: '+91 99068 92984', href: 'tel:+919906892984' },
    { label: '+91 99296 18966', href: 'tel:+919929618966' },
  ],

  whatsappNumber: '919906892984',

  address: ['Office, Bemina, Hamdaniya Colony,', 'Sector D, 190018'],

  hours: ['Mon – Sat: 9:00 AM – 7:00 PM', 'Sunday: 10:00 AM – 4:00 PM'],

  socials: [
    {
      name: 'Instagram',
      href: 'https://www.instagram.com/zurii_travels?igsh=MWs5MzZya242ZTRzdA%3D%3D&utm_source=qr',
    },
  ],
};

/**
 * WhatsApp deep link — the one place a wa.me URL is built.
 *
 * `context` names what the visitor was looking at; `kind` picks the sentence:
 *   whatsappLink('Kashmir Family Grandeur')            → package enquiry
 *   whatsappLink('Kashmir', 'destination')             → destination enquiry
 *   whatsappLink()                                     → general planning
 *
 * The second parameter defaults to 'package' so every existing caller keeps
 * its exact current message.
 */
export function whatsappLink(context, kind = 'package') {
  let message = 'Hello Zurii Travels! I would like help planning a trip.';
  if (context && kind === 'package') {
    message = `Hello Zurii Travels! I am interested in the "${context}" package. Could you please share more details?`;
  } else if (context && kind === 'destination') {
    message = `Hello Zurii Travels! I am interested in planning a trip to ${context}. Could you please share more details?`;
  }
  return `https://wa.me/${SITE.whatsappNumber}?text=${encodeURIComponent(message)}`;
}
