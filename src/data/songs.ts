// Static catalog for the Sargam demo. Shapes mirror `Song` + `Puzzle` in
// prisma/schema.prisma so this file is a drop-in replacement target once
// GET /api/games/[slug]/search and the puzzle sampler are wired up.
//
// Real audio right now comes from the iTunes Search API, called directly
// from the browser (see src/hooks/usePreviewUrl.ts) — no auth, real CORS
// support, and a workable Bollywood catalog via country=IN. Deezer's public
// search API looks equivalent on paper but soft-blocks server/datacenter
// IPs via Akamai bot detection in practice, which is a problem for any
// architecture that proxies it server-side. Once there's a real backend,
// this table should still move into `Song`/`Puzzle` and get a proper
// licensed ingest pipeline instead of a live third-party lookup per song.

export type Song = {
  id: string;
  title: string;
  artist: string;
  album: string; // film title
  year: number;
  genre: string;
  /** Two-stop gradient used for the placeholder cover art. */
  cover: [string, string];
};

export const SONGS: Song[] = [
  { id: "tujhe-dekha-to", title: "Tujhe Dekha To", artist: "Lata Mangeshkar, Kumar Sanu", album: "Dilwale Dulhania Le Jayenge", year: 1995, genre: "Romantic", cover: ["#c0392b", "#f6c453"] },
  { id: "chaiyya-chaiyya", title: "Chaiyya Chaiyya", artist: "Sukhwinder Singh, Sapna Awasthi", album: "Dil Se", year: 1998, genre: "Sufi-dance", cover: ["#b8860b", "#7a1f1f"] },
  { id: "kajra-re", title: "Kajra Re", artist: "Alisha Chinai, Shankar Mahadevan, Javed Ali", album: "Bunty Aur Babli", year: 2005, genre: "Item number", cover: ["#8e2de2", "#c0392b"] },
  { id: "tum-hi-ho", title: "Tum Hi Ho", artist: "Arijit Singh", album: "Aashiqui 2", year: 2013, genre: "Romantic ballad", cover: ["#3a1c1c", "#c0392b"] },
  { id: "kesariya", title: "Kesariya", artist: "Arijit Singh", album: "Brahmastra", year: 2022, genre: "Romantic", cover: ["#e67e22", "#c0392b"] },
  { id: "gerua", title: "Gerua", artist: "Arijit Singh, Antara Mitra", album: "Dilwale", year: 2015, genre: "Romantic", cover: ["#d35400", "#f6c453"] },
  { id: "channa-mereya", title: "Channa Mereya", artist: "Arijit Singh", album: "Ae Dil Hai Mushkil", year: 2016, genre: "Heartbreak", cover: ["#34495e", "#8e44ad"] },
  { id: "zinda", title: "Zinda", artist: "Siddharth Mahadevan", album: "Bhaag Milkha Bhaag", year: 2013, genre: "Motivational", cover: ["#1e3799", "#f6c453"] },
  { id: "dil-chahta-hai", title: "Dil Chahta Hai", artist: "Shankar Mahadevan", album: "Dil Chahta Hai", year: 2001, genre: "Friendship anthem", cover: ["#0f9b8e", "#f6c453"] },
  { id: "mere-sapno-ki-rani", title: "Mere Sapno Ki Rani", artist: "Kishore Kumar", album: "Aradhana", year: 1969, genre: "Classic romantic", cover: ["#7a1f1f", "#e6b422"] },
  { id: "ek-ladki-ko-dekha", title: "Ek Ladki Ko Dekha Toh Aisa Laga", artist: "Kumar Sanu", album: "1942: A Love Story", year: 1994, genre: "Classic romantic", cover: ["#6a2c70", "#f6c453"] },
  { id: "tum-se-hi", title: "Tum Se Hi", artist: "Mohit Chauhan", album: "Jab We Met", year: 2007, genre: "Romantic", cover: ["#2c3e91", "#e67e22"] },
  { id: "bole-chudiyan", title: "Bole Chudiyan", artist: "Amit Kumar, Udit Narayan, Alka Yagnik, Kavita Krishnamurthy", album: "Kabhi Khushi Kabhie Gham", year: 2001, genre: "Wedding", cover: ["#c0392b", "#e6b422"] },
  { id: "sheila-ki-jawani", title: "Sheila Ki Jawani", artist: "Sunidhi Chauhan", album: "Tees Maar Khan", year: 2010, genre: "Item number", cover: ["#e84393", "#fdcb6e"] },
  { id: "chikni-chameli", title: "Chikni Chameli", artist: "Shreya Ghoshal", album: "Agneepath", year: 2012, genre: "Item number", cover: ["#00695c", "#e84393"] },
  { id: "malhari", title: "Malhari", artist: "Vishal Dadlani", album: "Bajirao Mastani", year: 2015, genre: "Victory anthem", cover: ["#7a1f1f", "#f6c453"] },
  { id: "apna-time-aayega", title: "Apna Time Aayega", artist: "Ranveer Singh, DIVINE", album: "Gully Boy", year: 2019, genre: "Hip-hop", cover: ["#111827", "#e67e22"] },
  { id: "nagada-sang-dhol", title: "Nagada Sang Dhol", artist: "Shreya Ghoshal, Osman Mir", album: "Goliyon Ki Raasleela Ram-Leela", year: 2013, genre: "Garba", cover: ["#c0392b", "#8e44ad"] },
  { id: "senorita", title: "Senorita", artist: "Farhan Akhtar, Hrithik Roshan, Abhay Deol", album: "Zindagi Na Milegi Dobara", year: 2011, genre: "Party", cover: ["#0f9b8e", "#f6c453"] },
  { id: "london-thumakda", title: "London Thumakda", artist: "Labh Janjua, Sonu Kakkar, Neha Kakkar", album: "Queen", year: 2014, genre: "Wedding dance", cover: ["#d35400", "#c0392b"] },
  { id: "badtameez-dil", title: "Badtameez Dil", artist: "Benny Dayal", album: "Yeh Jawaani Hai Deewani", year: 2013, genre: "Party", cover: ["#e6b422", "#8e2de2"] },
  { id: "pehla-nasha", title: "Pehla Nasha", artist: "Udit Narayan, Sadhana Sargam", album: "Jo Jeeta Wohi Sikandar", year: 1992, genre: "Romantic classic", cover: ["#2c3e91", "#f6c453"] },
  { id: "barso-re", title: "Barso Re", artist: "Shreya Ghoshal", album: "Guru", year: 2007, genre: "Monsoon", cover: ["#0f4c75", "#e6b422"] },
  { id: "dhoom-machale", title: "Dhoom Machale", artist: "Sunidhi Chauhan", album: "Dhoom", year: 2004, genre: "Title dance", cover: ["#7a1f1f", "#111827"] },
  { id: "kal-ho-naa-ho", title: "Kal Ho Naa Ho", artist: "Sonu Nigam", album: "Kal Ho Naa Ho", year: 2003, genre: "Emotional", cover: ["#34495e", "#c0392b"] },
  { id: "rang-de-basanti", title: "Rang De Basanti", artist: "Daler Mehndi", album: "Rang De Basanti", year: 2006, genre: "Patriotic", cover: ["#e67e22", "#0f9b8e"] },
  { id: "jai-ho", title: "Jai Ho", artist: "Sukhwinder Singh, Tanvi Shah, Mahalaxmi Iyer", album: "Slumdog Millionaire", year: 2008, genre: "Celebration", cover: ["#c0392b", "#e6b422"] },
  { id: "ghungroo", title: "Ghungroo", artist: "Arijit Singh, Shilpa Rao", album: "War", year: 2019, genre: "Dance", cover: ["#111827", "#8e44ad"] },
  { id: "chaleya", title: "Chaleya", artist: "Arijit Singh, Shilpa Rao", album: "Jawan", year: 2023, genre: "Romantic", cover: ["#7a1f1f", "#f6c453"] },
  { id: "dilbar", title: "Dilbar", artist: "Neha Kakkar, Dhvani Bhanushali, Ikka", album: "Satyameva Jayate", year: 2018, genre: "Item number", cover: ["#8e2de2", "#e84393"] },
  { id: "tera-ban-jaunga", title: "Tera Ban Jaunga", artist: "Akhil Sachdeva, Tulsi Kumar", album: "Kabir Singh", year: 2019, genre: "Romantic", cover: ["#2c3e91", "#e67e22"] },
];

export function decadeOf(song: Song) {
  return `${Math.floor(song.year / 10) * 10}s`;
}
