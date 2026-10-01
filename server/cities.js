/** Destination + home cities for NexoraGo job & visa agency */
const DESTINATION_CITIES = {
  CA: ['Toronto', 'Vancouver', 'Calgary', 'Montreal', 'Ottawa', 'Edmonton', 'Mississauga', 'Winnipeg'],
  DE: ['Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Cologne', 'Stuttgart', 'Düsseldorf', 'Leipzig'],
  GB: ['London', 'Manchester', 'Birmingham', 'Edinburgh', 'Leeds', 'Bristol', 'Glasgow', 'Cambridge'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  IE: ['Dublin', 'Cork', 'Galway', 'Limerick'],
  PT: ['Lisbon', 'Porto', 'Braga', 'Faro'],
  SE: ['Stockholm', 'Gothenburg', 'Malmö', 'Uppsala'],
  AU: ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Canberra'],
  US: ['New York', 'San Francisco', 'Seattle', 'Austin', 'Chicago', 'Boston', 'Dallas', 'Los Angeles'],
  AE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman'],
  NZ: ['Auckland', 'Wellington', 'Christchurch', 'Hamilton'],
  SG: ['Singapore'],
  JP: ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Fukuoka'],
  FR: ['Paris', 'Lyon', 'Toulouse', 'Nantes', 'Nice'],
  PL: ['Warsaw', 'Kraków', 'Wrocław', 'Gdańsk'],
  MT: ['Valletta', 'Sliema', 'St. Julian\'s'],
  SA: ['Riyadh', 'Jeddah', 'Dammam', 'Khobar'],
  QA: ['Doha', 'Al Rayyan', 'Lusail'],
  MY: ['Kuala Lumpur', 'Penang', 'Johor Bahru', 'Cyberjaya'],
  KR: ['Seoul', 'Busan', 'Incheon', 'Daegu'],
  CZ: ['Prague', 'Brno', 'Ostrava'],
  IT: ['Milan', 'Rome', 'Turin', 'Bologna'],
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Málaga'],
  FI: ['Helsinki', 'Espoo', 'Tampere'],
  DK: ['Copenhagen', 'Aarhus', 'Odense'],
};

const HOME_CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata', 'Ahmedabad',
  'Jaipur', 'Chandigarh', 'Kochi', 'Indore', 'Lucknow', 'Noida', 'Gurugram', 'Coimbatore',
  'Kathmandu', 'Lalitpur', 'Pokhara', 'Dhaka', 'Chittagong', 'Colombo', 'Other',
];

const JOB_TITLES = [
  'Software Engineer', 'Full Stack Developer', 'Data Engineer', 'DevOps Engineer',
  'Cloud Architect', 'QA Engineer', 'Product Manager', 'UI/UX Designer',
  'Business Analyst', 'Nurse / Healthcare', 'Civil Engineer', 'Mechanical Engineer',
  'Electrical Engineer', 'Accountant', 'Digital Marketing', 'Customer Support',
  'Warehouse / Logistics', 'Chef / Hospitality', 'Teacher / Trainer', 'Sales Executive',
];

module.exports = { DESTINATION_CITIES, HOME_CITIES, JOB_TITLES };
