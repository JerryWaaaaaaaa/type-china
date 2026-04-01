/** Long corpus for Pretext fill inside the map (food, culture, minor places — not major geo labels). */
export const MAP_FILLER_TEXT = `
Wuxi Nantong Wenzhou Jinhua Jiaxing Zhuhai Foshan Quanzhou Weifang Zibo Luoyang Xiangyang Yichang
Baoding Tangshan Handan Anyang Luoyang Kaifeng Xiangtan Zhuzhou Hengyang Yueyang Ganzhou Jiujiang
Lanzhou noodle hot pot dim sum dumpling mooncake tea ceremony papercut shadow puppet lion dance
dragon boat kite lantern qipao hanfu silk embroidery porcelain celadon jade bamboo lotus peony
opera acrobat courtyard garden pavilion alley hutong courtyard wall gate bridge canal ferry market
temple fair ancestor festival harvest calligraphy seal ink brush rice wheat millet tea leaf bamboo shoot
plateau steppe karst delta bay strait island tide monsoon mist bamboo forest pine plum blossom
high-speed rail station platform ticket maglev metro bus route alleyway night market street food
`.replace(/\s+/g, ' ').trim()

export type GeoLabel = { name: string; lon: number; lat: number }

/** lon/lat with GEO_BOUNDS / GEO_BOUNDS_VIEW; main maps via raw SVG `fitPointsToCanvas` or viewport stretch (see mapGeo.ts). */
export const MAJOR_CITIES: GeoLabel[] = [
  { name: 'Beijing', lon: 116.4074, lat: 39.9042 },
  { name: 'Shanghai', lon: 121.4737, lat: 31.2304 },
  { name: 'Guangzhou', lon: 113.2644, lat: 23.1291 },
  { name: 'Shenzhen', lon: 114.0579, lat: 22.5431 },
  { name: 'Chengdu', lon: 104.0668, lat: 30.5728 },
  { name: "Xi'an", lon: 108.9402, lat: 34.3416 },
  { name: 'Hangzhou', lon: 120.1551, lat: 30.2741 },
  { name: 'Wuhan', lon: 114.3055, lat: 30.5931 },
  { name: 'Nanjing', lon: 118.7969, lat: 32.0603 },
  { name: 'Chongqing', lon: 106.5516, lat: 29.563 },
  { name: 'Hong Kong', lon: 114.1694, lat: 22.3193 },
  { name: 'Macau', lon: 113.5439, lat: 22.1987 },
  { name: 'Harbin', lon: 126.535, lat: 45.803 },
  { name: 'Urumqi', lon: 87.6168, lat: 43.8256 },
  { name: 'Lhasa', lon: 91.132, lat: 29.65 },
  { name: 'Kunming', lon: 102.8329, lat: 24.8801 },
]

/** Mountains, rivers, deserts, plateaus — large text inside the silhouette. */
export const NATURAL_FEATURES: GeoLabel[] = [
  { name: 'Yangtze', lon: 104.0, lat: 30.5 },
  { name: 'Yellow River', lon: 109.0, lat: 35.5 },
  { name: 'Himalaya', lon: 87.0, lat: 28.0 },
  { name: 'Huangshan', lon: 118.17, lat: 30.13 },
  { name: 'West Lake', lon: 120.15, lat: 30.25 },
  { name: 'Li River', lon: 110.28, lat: 25.28 },
  { name: 'Taklamakan', lon: 84.0, lat: 39.0 },
  { name: 'Gobi', lon: 105.0, lat: 42.5 },
  { name: 'Kunlun Shan', lon: 84.5, lat: 35.5 },
  { name: 'Tian Shan', lon: 82.0, lat: 43.0 },
  { name: 'Altun Shan', lon: 90.0, lat: 39.0 },
  { name: 'Qin Ling', lon: 108.5, lat: 34.0 },
  { name: 'Da Hinggan', lon: 124.0, lat: 50.5 },
  { name: 'Tibet', lon: 88.0, lat: 32.0 },
]

/** Major cities outside the silhouette (viewport projection, GEO_BOUNDS_VIEW). */
export const OUTSIDE_MAJOR_CITIES: GeoLabel[] = [
  { name: 'Ulaanbaatar', lon: 106.9058, lat: 47.8864 },
  { name: 'Seoul', lon: 126.978, lat: 37.5665 },
  { name: 'Pyongyang', lon: 125.7625, lat: 39.0392 },
  { name: 'Taipei', lon: 121.5654, lat: 25.033 },
  { name: 'Tokyo', lon: 139.6917, lat: 35.6895 },
  { name: 'Hanoi', lon: 105.8342, lat: 21.0278 },
  { name: 'Delhi', lon: 77.209, lat: 28.6139 },
  { name: 'Lucknow', lon: 80.9462, lat: 26.8467 },
  { name: 'Varanasi', lon: 82.9739, lat: 25.3176 },
  { name: 'Islamabad', lon: 73.0479, lat: 33.6844 },
  { name: 'Almaty', lon: 76.9454, lat: 43.238 },
  { name: 'Irkutsk', lon: 104.2964, lat: 52.2864 },
  { name: 'Vladivostok', lon: 131.8855, lat: 43.1155 },
  { name: 'Manila', lon: 120.9842, lat: 14.5995 },
]

/** Seas, straits, bays — outside the silhouette. */
export const OUTSIDE_NATURAL_FEATURES: GeoLabel[] = [
  { name: 'South China Sea', lon: 115.0, lat: 12.0 },
  { name: 'Taiwan Strait', lon: 119.5, lat: 24.5 },
  { name: 'Bay of Bengal', lon: 90.0, lat: 16.0 },
  { name: 'East China Sea', lon: 126.0, lat: 30.0 },
  { name: 'Sea of Japan', lon: 130.0, lat: 40.0 },
]

/** Major cities in countries and territories neighboring China (surrounding map fill). */
export const SURROUNDING_CITIES_TEXT = `
Russia Moscow Saint Petersburg Novosibirsk Yekaterinburg Vladivostok Khabarovsk Irkutsk Krasnoyarsk
Kazakhstan Almaty Nur-Sultan Shymkent Karaganda
Kyrgyzstan Bishkek Osh
Tajikistan Dushanbe Khujand
Mongolia Ulaanbaatar Erdenet Darkhan
North Korea Pyongyang Hamhung Chongjin
South Korea Seoul Busan Incheon Daegu Daejeon Gwangju Suwon Ulsan
Japan Tokyo Yokohama Osaka Nagoya Sapporo Fukuoka Kobe Kyoto Hiroshima Sendai Kawasaki
Taiwan Taipei Kaohsiung Taichung Tainan Taoyuan Hsinchu
Philippines Manila Quezon City Davao Cebu Zamboanga
Vietnam Hanoi Ho Chi Minh City Da Nang Haiphong Can Tho Hue
Laos Vientiane Luang Prabang Pakse
Myanmar Yangon Mandalay Naypyidaw Mawlamyine
Thailand Bangkok Chiang Mai Phuket Hat Yai
Cambodia Phnom Penh Siem Reap Battambang
Bangladesh Dhaka Chittagong Khulna
Bhutan Thimphu Phuentsholing Paro
Nepal Kathmandu Pokhara Lalitpur Bharatpur
India Delhi Mumbai Kolkata Chennai Bengaluru Hyderabad Ahmedabad Jaipur Lucknow Surat Pune Patna Nagpur Indore
Pakistan Karachi Lahore Islamabad Rawalpindi Peshawar Faisalabad Multan
Afghanistan Kabul Kandahar Herat Mazar-i-Sharif
Hong Kong Kowloon Victoria Central Tuen Mun Sha Tin
Macau Taipa Cotai
`.replace(/\s+/g, ' ').trim()
