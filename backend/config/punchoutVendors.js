// Punchout Vendor Configurations
// Add your actual credentials from each vendor

const PUNCHOUT_VENDORS = {
  amazon_business: {
    name: 'Amazon Business',
    type: 'cxml',
    enabled: true,
    config: {
      // Use test URL if in test mode, otherwise production URL
      punchoutUrl: process.env.AMAZON_PUNCHOUT_MODE === 'test'
        ? (process.env.AMAZON_PUNCHOUT_TEST_URL || 'https://abintegrations.amazon.com/punchout/test')
        : (process.env.AMAZON_PUNCHOUT_URL || 'https://abintegrations.amazon.com/punchout/test'),
      fromIdentity: process.env.AMAZON_IDENTITY || process.env.AMAZON_SENDER_ID || 'Yeemsproduction',
      toIdentity: 'Amazon',
      senderIdentity: process.env.AMAZON_SENDER_ID || 'Yeemsproduction',
      sharedSecret: process.env.AMAZON_SHARED_SECRET,
      returnUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/punchout/return`,
      // Purchase order configuration (OAG)
      poUrl: process.env.AMAZON_PO_URL,
      poEnabled: !!process.env.AMAZON_PO_URL
    },
    logo: '/logos/amazon-business.png',
    categories: ['Office Supplies', 'Technology', 'Facilities']
  },

  staples: {
    name: 'Staples Business Advantage',
    type: 'cxml',
    enabled: true,
    config: {
      punchoutUrl: 'https://punchout.staplesadvantage.com',
      fromIdentity: 'YOUR_STAPLES_ACCOUNT_NUMBER',
      toIdentity: 'staples.com',
      senderIdentity: 'YOUR_COMPANY_ID',
      sharedSecret: process.env.STAPLES_PUNCHOUT_SECRET,
      returnUrl: `${process.env.FRONTEND_URL}/punchout/return`
    },
    logo: '/logos/staples.png',
    categories: ['Office Supplies', 'Furniture', 'Technology']
  },

  office_depot: {
    name: 'Office Depot',
    type: 'cxml',
    enabled: true,
    config: {
      punchoutUrl: 'https://punchout.officedepot.com',
      fromIdentity: 'YOUR_OD_ACCOUNT_NUMBER',
      toIdentity: 'officedepot.com',
      senderIdentity: 'YOUR_COMPANY_ID',
      sharedSecret: process.env.OFFICE_DEPOT_SECRET,
      returnUrl: `${process.env.FRONTEND_URL}/punchout/return`
    },
    logo: '/logos/office-depot.png',
    categories: ['Office Supplies', 'Technology']
  },

  cdw: {
    name: 'CDW',
    type: 'cxml',
    enabled: true,
    config: {
      punchoutUrl: 'https://punchout.cdw.com',
      fromIdentity: 'YOUR_CDW_ACCOUNT_NUMBER',
      toIdentity: 'cdw.com',
      senderIdentity: 'YOUR_COMPANY_ID',
      sharedSecret: process.env.CDW_PUNCHOUT_SECRET,
      returnUrl: `${process.env.FRONTEND_URL}/punchout/return`
    },
    logo: '/logos/cdw.png',
    categories: ['Technology', 'Hardware', 'Software']
  },

  grainger: {
    name: 'Grainger',
    type: 'cxml',
    enabled: true,
    config: {
      punchoutUrl: 'https://punchout.grainger.com',
      fromIdentity: 'YOUR_GRAINGER_ACCOUNT',
      toIdentity: 'grainger.com',
      senderIdentity: 'YOUR_COMPANY_ID',
      sharedSecret: process.env.GRAINGER_SECRET,
      returnUrl: `${process.env.FRONTEND_URL}/punchout/return`
    },
    logo: '/logos/grainger.png',
    categories: ['Facilities', 'MRO', 'Safety']
  }
};

module.exports = PUNCHOUT_VENDORS;
