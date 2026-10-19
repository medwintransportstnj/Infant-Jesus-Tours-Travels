// Starter list for pickup/destination suggestions: Tamil Nadu in depth plus major cities and
// popular destinations nationwide (carried over from the legacy site). Visitors can always type
// any place — this only speeds up common entries.
export const INDIA_LOCATIONS: string[] = [
  'Thanjavur', 'Thanjavur New Bus Stand', 'Thanjavur Old Bus Stand', 'Thanjavur Railway Station', 'Thanjavur Airport',
  'Thanjavur Medical College', 'Brihadeeswarar Temple, Thanjavur', 'Thanjavur Palace', 'Madhakottai, Thanjavur',
  'Vallam, Thanjavur', 'Budalur, Thanjavur', 'Orathanadu', 'Pattukkottai', 'Peravurani', 'Papanasam', 'Kumbakonam',
  'Chennai', 'Chennai Central Railway Station', 'Chennai International Airport', 'Chennai Koyambedu Bus Stand',
  'Coimbatore', 'Coimbatore Railway Station', 'Coimbatore International Airport', 'Madurai', 'Madurai Railway Station',
  'Madurai Airport', 'Meenakshi Amman Temple, Madurai', 'Tiruchirappalli (Trichy)', 'Trichy Railway Station',
  'Trichy International Airport', 'Salem', 'Salem Railway Station', 'Erode', 'Vellore', 'Tirunelveli', 'Tiruppur',
  'Thoothukudi (Tuticorin)', 'Dindigul', 'Karur', 'Namakkal', 'Nagapattinam', 'Thiruvarur', 'Pudukkottai', 'Ariyalur',
  'Perambalur', 'Cuddalore', 'Villupuram', 'Kallakurichi', 'Ranipet', 'Tirupathur', 'Krishnagiri', 'Dharmapuri', 'Theni',
  'Virudhunagar', 'Sivaganga', 'Ramanathapuram', 'Kanyakumari', 'Nagercoil', 'Tenkasi', 'Mayiladuthurai',
  'Rameswaram', 'Rameswaram Railway Station', 'Ramanathaswamy Temple, Rameswaram', 'Pamban Bridge',
  'Velankanni', 'Basilica of Our Lady of Good Health, Velankanni', 'Ooty (Udhagamandalam)', 'Ooty Bus Stand',
  'Coonoor', 'Kotagiri', 'Kodaikanal', 'Kodaikanal Lake', 'Munnar', 'Thekkady', 'Alleppey (Alappuzha)',
  'Vivekananda Rock Memorial, Kanyakumari', 'Chidambaram', 'Swamimalai', 'Darasuram', 'Gangaikonda Cholapuram',
  'Pondicherry (Puducherry)', 'Mahabalipuram (Mamallapuram)', 'Tirupati', 'Tirumala', 'Palani', 'Srirangam',
  'Rockfort Temple, Trichy', 'Yercaud', 'Hogenakkal Falls', 'Mysore', 'Coorg (Kodagu)', 'Wayanad', 'Bangalore (Bengaluru)',
  'Bengaluru International Airport', 'Kochi', 'Kochi International Airport', 'Thiruvananthapuram', 'Kozhikode',
  'Thrissur', 'Kollam', 'Kannur', 'Hyderabad', 'Hyderabad International Airport', 'Vijayawada', 'Visakhapatnam',
  'Tirupati Airport', 'Warangal', 'Guntur', 'Nellore', 'Delhi', 'New Delhi Railway Station', 'Indira Gandhi International Airport',
  'Gurugram', 'Noida', 'Faridabad', 'Mumbai', 'Mumbai Chhatrapati Shivaji Airport', 'Pune', 'Nagpur', 'Nashik', 'Thane',
  'Kolkata', 'Kolkata Airport', 'Howrah', 'Darjeeling', 'Siliguri', 'Bhubaneswar', 'Puri', 'Cuttack', 'Ahmedabad',
  'Surat', 'Vadodara', 'Rajkot', 'Jaipur', 'Jodhpur', 'Udaipur', 'Jaisalmer', 'Ajmer', 'Pushkar', 'Lucknow', 'Kanpur',
  'Agra', 'Taj Mahal, Agra', 'Varanasi', 'Prayagraj (Allahabad)', 'Amritsar', 'Golden Temple, Amritsar', 'Chandigarh',
  'Ludhiana', 'Shimla', 'Manali', 'Dharamshala', 'Srinagar (Kashmir)', 'Gulmarg', 'Leh Ladakh', 'Jammu', 'Haridwar',
  'Rishikesh', 'Dehradun', 'Kedarnath', 'Badrinath', 'Nainital', 'Patna', 'Ranchi', 'Raipur', 'Bhopal', 'Indore', 'Gwalior',
  'Guwahati', 'Shillong', 'Gangtok', 'Bhavnagar', 'Mangalore', 'Hubli', 'Belgaum', 'Vijayanagara (Hampi)',
];

export function matchLocations(query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const l of INDIA_LOCATIONS) {
    const lower = l.toLowerCase();
    if (lower === q) continue;
    if (lower.startsWith(q)) starts.push(l);
    else if (lower.includes(q)) contains.push(l);
  }
  return [...starts, ...contains].slice(0, limit);
}
