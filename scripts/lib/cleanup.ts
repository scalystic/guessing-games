// Catalog hygiene — pure string functions that split a store-shaped row into
// the three things a player actually reasons about: the song, who sang it, and
// what film it is from.
//
// Everything here is DETERMINISTIC and side-effect free. Nothing in this file
// reaches the network or the database; scripts/clean-catalog.ts does both and
// calls into these. That split is the point — the guesses this file makes are
// the ones most likely to be wrong on some row nobody has looked at yet, and
// they need to be testable and re-runnable without a live catalog.
//
// The rules encoded here are Apple/iTunes conventions, because that is where
// the metadata came from: `Kesariya (From "Brahmastra")`, `Malang (feat. The
// PropheC)`, `Agar Tum Mil Jao (Female Version)`. Ingests from another store
// will need their own dialect added rather than these loosened.

// ---------------------------------------------------------------------------
// Variant classification
// ---------------------------------------------------------------------------

/// Mirrors the SongVariant enum in schema.prisma. Redeclared as a plain union
/// rather than imported from the generated client so this module stays usable
/// before `prisma generate` has ever run.
export type SongVariant =
  | 'INSTRUMENTAL'
  | 'LOFI'
  | 'REMIX'
  | 'MASHUP'
  | 'COVER'
  | 'LIVE'
  | 'ALTERNATE'
  | 'MISMATCH'

/// Ordered most-specific first, and the FIRST match wins. Order is load-bearing
/// twice over:
///
///   "Karaoke Version"  -> INSTRUMENTAL, not ALTERNATE. Both patterns match;
///                        the one that says there are no vocals is the useful one.
///   "Lofi Flip"        -> LOFI, not REMIX. "flip" and "mix" both appear, and
///                        lo-fi is the narrower, truer label.
///
/// So new patterns go in at the specificity they deserve, not on the end.
const VARIANT_PATTERNS: ReadonlyArray<readonly [SongVariant, RegExp]> = [
  // No vocals. Checked first because a karaoke/backing track is also, always,
  // labelled as a "version" of something.
  [
    'INSTRUMENTAL',
    /\b(instrumental|karaoke|backing track|in the style of|originally performed by)\b/i,
  ],
  // Bedroom re-edits. Before REMIX: every one of these is also "a mix".
  ['LOFI', /\b(lo-?fi|slowed(\s*\+?\s*reverb)?|reverb(ed)?|chill\s*(mix|flip)|flip)\b/i],
  // Two or more songs in one. Before REMIX for the same reason.
  ['MASHUP', /\b(mash-?up|medley|mixtape|non-?stop|jukebox)\b/i],
  // Re-sung by someone else.
  ['COVER', /\b(cover|unplugged|acoustic|recreated|recreation|tribute|rendition)\b/i],
  // In front of an audience. "En Vivo" is Spanish "live" and shows up on one row.
  ['LIVE', /\b(live|en vivo|concert|in concert|mtv unplugged)\b/i],
  // Re-edit of the original recording.
  [
    'REMIX',
    /\b(re-?mix|club (mix|edit)|dance mix|extended (mix|version)|radio edit|bootleg|dj\s+\w+\s+mix|\w+\s+mix)\b/i,
  ],
  // Sanctioned alternate cut. Last: it is the weakest claim, and nearly every
  // pattern above would also satisfy "…is a version of the song".
  [
    'ALTERNATE',
    /\b(reprise|(male|female)\s*(version|vocals?)?|version\s*\d|alternate|duet version|film version|movie version|revisited|2\.0)\b/i,
  ],
]

/// Why this recording is not the original, or null if nothing says it is not.
///
/// Reads the title AND the album, because the marker lands on either one:
/// `Pairon Mein Bandhan Hai - Instrumental` carries it in the title, while
/// `Bachna Ae Haseeno (Khatooba Mix)` sits in an album called
/// "The Hottest Dance Mix" — and plenty of compilation rows only say it once.
///
/// Deliberately does NOT look at the artist. A cover is identified by the
/// recording being labelled one, not by the credited artist being unfamiliar —
/// treating "an artist I don't recognise" as evidence is how a correct row by a
/// less famous playback singer gets thrown out.
export function detectVariant(title: string, album: string | null): SongVariant | null {
  // Only the PARENTHETICAL and trailing-dash parts of a title are qualifiers.
  // The bare words are the song's actual name, and songs are genuinely called
  // "Live It Up" and "Cover Me" — scanning those would flag them.
  const qualifiers = [...extractQualifiers(title), album ?? ''].join(' | ')
  if (!qualifiers.trim()) return null

  for (const [variant, pattern] of VARIANT_PATTERNS) {
    if (pattern.test(qualifiers)) return variant
  }
  return null
}

/// The bracketed and trailing-dash segments of a title — the parts a store uses
/// for qualifiers, as opposed to the song's name.
function extractQualifiers(title: string): string[] {
  const out: string[] = []
  for (const match of title.matchAll(/[([{]([^)\]}]*)[)\]}]/g)) out.push(match[1])
  // " - Instrumental", " - Title Track". Anchored to the end so a hyphenated
  // song name ("Dard - E - Disco") does not read as a qualifier.
  const dash = title.match(/\s[-–—]\s([^-–—]+)$/)
  if (dash) out.push(dash[1])
  return out
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

/// `(From "Brahmastra")`, `[From "Highway"]`, `(from "Lootera")`. The film is
/// stated outright, which makes it the strongest movie signal in the row.
///
/// QUOTED FIRST, and the quotes — not the bracket — delimit the capture. Film
/// titles contain brackets of their own: `Kar Gayi Chull (From "Kapoor & Sons
/// (Since 1921)")`. Stopping the capture at the first `)` truncates the film to
/// "Kapoor & Sons (Since 1921" and leaves `")` glued to the song name, which is
/// exactly what a bracket-delimited pattern did here before.
const FROM_FILM_QUOTED = /[([{]\s*from\s*["“'‘]([^"”'’]+)["”'’]\s*[)\]}]/gi

/// The unquoted spelling, which some rows use. Bracket-delimited by necessity —
/// there is no other terminator — so a film with brackets in its name is not
/// recoverable from this form. Runs second so the quoted form always wins.
const FROM_FILM_BARE = /[([{]\s*from\s+([^)\]}]+)[)\]}]/gi

/// Featured-artist credit. Captured rather than discarded — a featured vocalist
/// is a singer, and on a `Malang (feat. The PropheC)` row they may be the ONLY
/// singer named anywhere.
const FEAT = /[([{]\s*(?:feat\.?|ft\.?|featuring)\s*([^)\]}]+)[)\]}]/gi

/// Qualifiers that carry no information a player would ever type.
const NOISE_QUALIFIER =
  /[([{]\s*(original motion picture soundtrack|original soundtrack|motion picture soundtrack|soundtrack|deluxe|remastered?(\s*\d{4})?|bonus track|explicit|clean|single|ep|full song|full video|audio|lyrical|video|hd|4k|\d{3,4}p)[^)\]}]*[)\]}]/gi

/// Junk that ONLY ever appears on a title scraped from a video platform:
/// a resolution, a "Hi Fi Sounds" tag, an "Official Video" banner.
///
/// Every token here is unambiguous — no song is called "1080p" — so these are
/// safe to strip on sight, and finding one is also what proves the row came
/// from a video platform at all.
const YT_NOISE_STRONG =
  /\s*\b(1080p|720p|480p|4k|hi\s?fi\s+sounds?|official\s+(music\s+)?video|official\s+audio|lyric(al)?\s+video|full\s+movie)\b\s*/gi

/// Junk that is usually a scrape artefact but can be a real song's real words —
/// "Sing a Full Song" by Ninebarrow is an actual track on an actual album.
///
/// So these are stripped ONLY from a title that YT_NOISE_STRONG already
/// matched, i.e. one already proven to be a scraped video title. On its own,
/// "Full Song" is left alone. The asymmetry is the whole point: the cost of
/// keeping junk on a scraped row is a scruffy name, and the cost of stripping a
/// real title is an unguessable song.
const YT_NOISE_WEAK =
  /\s*\b(full\s+video(\s+song)?|full\s+song|video\s+song|audio\s+song|full|song|hd)\b\s*/gi

/// `Ae Dil Hai Mushkil Title Track` — a store's note that this is the film's
/// namesake song, not part of the song's name. Anchored to the end so a song
/// genuinely called "Title Track" survives.
const TITLE_TRACK_SUFFIX = /\s*[-–—]?\s*\btitle\s+track\s*$/i

/// A trailing `( Refugee 2000 )` — a scrape that parked the film and year in
/// brackets. Only stripped alongside strong video-platform noise, where the
/// bracket is known to be an artefact rather than part of the name.
const TRAILING_FILM_YEAR = /\s*[([{][^)\]}]*\b(19|20)\d{2}\b[^)\]}]*[)\]}]\s*$/

/// `, Pt. 1` / `, Part 2` — a store's way of numbering a split track.
const PART_SUFFIX = /,?\s*\b(pt\.?|part)\s*\.?\s*\d+\s*$/i

export type CleanTitle = {
  /// The song's name, and nothing else.
  title: string
  /// The film named inside the title, if it named one.
  movie: string | null
  /// Featured artists lifted out of the title.
  featured: string[]
}

/// Reduce a store title to the bare song name, handing back what was stripped.
///
/// Nothing is thrown away silently: the film and the featured artists are the
/// two things a title hides that belong in their own columns, and both come
/// back in the return value for the caller to merge.
export function cleanSongTitle(raw: string): CleanTitle {
  let movie: string | null = null
  const featured: string[] = []

  let out = raw

  // Order matters: pull the two things worth keeping BEFORE the noise sweep,
  // which would otherwise eat the brackets they live in.
  const takeFilm = (_m: string, film: string) => {
    if (!movie) movie = tidy(film)
    return ' '
  }
  out = out.replace(FROM_FILM_QUOTED, takeFilm).replace(FROM_FILM_BARE, takeFilm)
  out = out.replace(FEAT, (_m, names: string) => {
    featured.push(...splitArtists(names))
    return ' '
  })

  out = out.replace(NOISE_QUALIFIER, ' ')

  // Video-platform junk, gated on proof that this IS a scraped title. See
  // YT_NOISE_WEAK for why the weak tokens are not stripped unconditionally.
  if (YT_NOISE_STRONG.test(out)) {
    YT_NOISE_STRONG.lastIndex = 0
    out = out.replace(YT_NOISE_STRONG, ' ').replace(TRAILING_FILM_YEAR, ' ').replace(YT_NOISE_WEAK, ' ')
  }
  YT_NOISE_STRONG.lastIndex = 0

  // Variant qualifiers go too — detectVariant() has already read the raw title,
  // so the information is preserved in the column rather than in the name.
  //
  // Three shapes, because rows use all three: bracketed `(Remix)`, trailing
  // dash `- Instrumental`, and a bare trailing word `Jo Bheji Thi Dua  LOFI`.
  // The bare form is anchored to the END and never matched mid-title — songs
  // are called "Live It Up" and "Cover Me", and stripping a word out of the
  // middle of a name would destroy them.
  for (const [, pattern] of VARIANT_PATTERNS) {
    out = out.replace(new RegExp(`[([{][^)\\]}]*${pattern.source}[^)\\]}]*[)\\]}]`, 'gi'), ' ')
    out = out.replace(new RegExp(`\\s[-–—]\\s[^-–—]*${pattern.source}[^-–—]*$`, 'i'), ' ')
    out = out.replace(new RegExp(`\\s+${pattern.source}\\s*$`, 'i'), ' ')
  }

  out = out.replace(TITLE_TRACK_SUFFIX, ' ')

  out = out
    // Empty brackets left behind by the sweeps above.
    .replace(/[([{]\s*[)\]}]/g, ' ')
    .replace(PART_SUFFIX, ' ')
    // A bare trailing year: `Aap Mujhe Achche Lagne Lage (2002)` -> the year is
    // already its own column.
    .replace(/[([{]\s*(19|20)\d{2}\s*[)\]}]\s*$/g, ' ')
    .replace(/\s*[-–—|,]\s*$/, '')
    .replace(/^\s*[-–—|]\s*/, '')

  return { title: tidy(out) || tidy(raw), movie, featured }
}

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

/// Music directors. They are credited FIRST on most Indian film tracks — Apple
/// lists "Pritam, Arijit Singh, Shreya Ghoshal" — which is exactly why they
/// cannot be filtered by position: the composer sits where the lead singer
/// should be, and dropping them is what makes "first credit = lead vocal" true.
///
/// Only names that are ALWAYS a composer on these rows belong here. The
/// composer-singers (Vishal Dadlani, Shankar Mahadevan, Shekhar Ravjiani,
/// Himesh Reshammiya, Badshah, Yo Yo Honey Singh, Bappi Lahiri, Amaal Mallik,
/// Payal Dev, Sachin-Jigar) are deliberately ABSENT: they sing often enough
/// that removing them would strip the correct answer off a row where they were
/// credited for their voice. Keeping a composer who did not sing is a
/// cosmetic error; deleting the singer is a wrong answer.
const COMPOSERS = new Set(
  [
    'Pritam',
    'Pritam Chakraborty',
    'Jatin-Lalit',
    'Jatin Lalit',
    'A.R. Rahman',
    'A. R. Rahman',
    'AR Rahman',
    'Ajay-Atul',
    'Amit Trivedi',
    'Sajid-Wajid',
    'Sajid Wajid',
    'Nadeem-Shravan',
    'Anu Malik',
    'Salim-Sulaiman',
    'Salim Merchant',
    'Sohail Sen',
    'Aadesh Shrivastava',
    'Sandesh Shandilya',
    'Vishal Bhardwaj',
    'Harris Jayaraj',
    'Rajesh Roshan',
    'R.D. Burman',
    'R. D. Burman',
    'S.D. Burman',
    'S. D. Burman',
    'Laxmikant-Pyarelal',
    'Ismail Darbar',
    'Anand-Milind',
    'Ram Sampath',
    'Mithoon',
    'Tanishk Bagchi',
    'Meet Bros',
    'Meet Bros Anjjan',
    'Devi Sri Prasad',
    'Ilaiyaraaja',
    'Kalyanji-Anandji',
    'Clinton Cerejo',
    'Jeet Gannguli',
    'Rochak Kohli',
    'Sachet-Parampara',
    'Anirudh Ravichander',
    'Abhijit Vaghani',
    'Shankar Ehsaan Loy',
    'Shankar-Ehsaan-Loy',
    'Loy Mendonsa',
    'Ehsaan Noorani',
    'Madan Mohan',
    'Naushad',
    'O.P. Nayyar',
    'Ravindra Jain',
    'Usha Khanna',
    'Bappi Lahiri Orchestra',
    'Justin-Uday Duo',
    'Gourov-Roshin',
    'Raghav Sachar',
    'Vipin Patwa',
    'Arko',
    'Arko Pravo Mukherjee',
    'Thaman S',
    'Jaani',
    'B Praak Music',
  ].map(normalizeName),
)

/// Lyricists. Same reasoning as COMPOSERS, and the same exclusions — a lyricist
/// who also sings (Jaani, Kumaar on some rows) is a judgement call, and this
/// list keeps only the ones who reliably do not.
const LYRICISTS = new Set(
  [
    'Amitabh Bhattacharya',
    'Irshad Kamil',
    'Gulzar',
    'Javed Akhtar',
    'Prasoon Joshi',
    'Sameer',
    'Sameer Anjaan',
    'Anand Bakshi',
    'Manoj Muntashir',
    'Shellee',
    'Swanand Kirkire',
    'Mayur Puri',
    'Rashmi Virag',
    'Neelesh Misra',
    'Jaideep Sahni',
    'Anvita Dutt',
    'Anvita Dutt Guptan',
    'Majrooh Sultanpuri',
    'Shakeel Badayuni',
    'Hasrat Jaipuri',
    'Shailendra',
    'Indeevar',
    'Santosh Anand',
    'Kausar Munir',
    'Siddharth-Garima',
    'Varun Grover',
    'Puneet Sharma',
    'Kunaal Vermaa',
    'Shabbir Ahmed',
    'Dev Kohli',
    'Faaiz Anwar',
    'Sandeep Nath',
    'Mudassar Aziz',
    'Nilesh Ahuja',
    'Shloke Lal',
    'Vayu',
    'Priya Saraiya',
    'Kumaar',
  ].map(normalizeName),
)

/// Record labels and YouTube channels that landed in the artist column. A row
/// credited to one of these has no artist at all — the ingest read the uploader
/// instead — so it is both an artist to drop AND a strong mismatch signal.
const NON_ARTISTS = new Set(
  [
    'T-Series',
    'Tips Official',
    'Tips Music',
    'Saregama',
    'Shemaroo',
    'Shemaroo Movies',
    'Sony Music India',
    'SonyMusicIndiaVEVO',
    'Zee Music Company',
    'YRF',
    'Yash Raj Films',
    'Venus',
    'Ultra Bollywood',
    'Various Artists',
    'Unknown Artist',
    'Bollywood',
    'Moza Series',
    "90's Hits Songs Bollywood",
    '90s Hits Songs Bollywood',
  ].map(normalizeName),
)

/// Prominent playback singers — the voices a player actually has in their head.
///
/// Used to RANK candidates, never to delete them, and that asymmetry is the
/// whole design. The problem it solves: Apple's credit order is lead-first on
/// most rows but plain ALPHABETICAL on others, and there is no way to tell
/// which from the string. On an alphabetical row, "take the first two" hands
/// back the chorus — `Aankhein Khuli` credits "Ishaan, Lata Mangeshkar, …,
/// Udit Narayan" and position alone picks a session vocalist over Lata.
///
/// Ranking fixes that without a blocklist's downside. Actors are the acute
/// case: Shah Rukh Khan, Kajol and Aamir Khan are credited on soundtracks they
/// did not sing on — but Aamir DID sing "Chanda Chamke" and Amitabh Bachchan
/// DID sing "Say Shava Shava", so a list that deleted actors would delete
/// correct answers. Demoting them instead means an actor still wins when no
/// established singer is credited, which is exactly the case where they sang.
///
/// Incompleteness is safe by construction: an absent singer is merely not
/// promoted, and still wins on position when nobody here outranks them.
const PLAYBACK_SINGERS = new Set(
  [
    // Playback singers, roughly the 1950s onward.
    'Lata Mangeshkar', 'Asha Bhosle', 'Kishore Kumar', 'Mohammed Rafi', 'Mukesh',
    'Manna Dey', 'Hemant Kumar', 'Geeta Dutt', 'Talat Mahmood', 'Mahendra Kapoor',
    'Kumar Sanu', 'Udit Narayan', 'Alka Yagnik', 'Abhijeet', 'Sonu Nigam',
    'Kavita Krishnamurthy', 'Sadhana Sargam', 'Anuradha Paudwal', 'Amit Kumar',
    'Suresh Wadkar', 'S.P. Balasubrahmanyam', 'Sukhwinder Singh', 'Jaspinder Narula',
    'Sapna Awasthi', 'Roop Kumar Rathod', 'Babul Supriyo', 'Sudesh Bhosle',
    'Shaan', 'KK', 'Shreya Ghoshal', 'Sunidhi Chauhan', 'Kunal Ganjawala',
    'Shankar Mahadevan', 'Mahalakshmi Iyer', 'Alisha Chinai', 'Richa Sharma',
    'Sowmya Raoh', 'Shilpa Rao', 'Rahat Fateh Ali Khan', 'Nusrat Fateh Ali Khan',
    'Atif Aslam', 'Shafqat Amanat Ali', 'Zubeen Garg', 'Mika Singh', 'Javed Ali',
    'Mohit Chauhan', 'Kailash Kher', 'Rekha Bhardwaj', 'Shreya', 'Benny Dayal',
    'Naresh Iyer', 'Madhushree', 'Bela Shende', 'Kavita Seth', 'Dominique Cerejo',
    'Arijit Singh', 'Neha Kakkar', 'Armaan Malik', 'Jubin Nautiyal', 'B. Praak',
    'B Praak', 'Darshan Raval', 'Ash King', 'Nakash Aziz', 'Dev Negi',
    'Jonita Gandhi', 'Nikhita Gandhi', 'Palak Muchhal', 'Tulsi Kumar',
    'Asees Kaur', 'Shashaa Tirupati', 'Sachet Tandon', 'Parampara Thakur',
    'Vishal Mishra', 'Raghav Chaitanya', 'Stebin Ben', 'Tanishka Sanghvi',
    'Sanam Puri', 'Ankit Tiwari', 'Papon', 'Shirley Setia', 'Harrdy Sandhu',
    'Guru Randhawa', 'Diljit Dosanjh', 'Ammy Virk', 'Kanika Kapoor',
    'Monali Thakur', 'Neeti Mohan', 'Antara Mitra', 'Aditi Singh Sharma',
    'Shalmali Kholgade', 'Sona Mohapatra', 'Harshdeep Kaur', 'Nooran Sisters',
    'Master Saleem', 'Wadali Brothers', 'Sukhbir', 'Daler Mehndi',
    'Kanwar Grewal', 'Satinder Sartaaj', 'Gurdas Maan', 'Jazzy B',
    'Vishal Dadlani', 'Shekhar Ravjiani', 'Amaal Mallik', 'Himesh Reshammiya',
    'Badshah', 'Yo Yo Honey Singh', 'Raftaar', 'DIVINE', 'Bohemia',
    'Bappi Lahiri', 'Udbhav', 'Shweta Pandit', 'Sunidhi', 'Anushka Manchanda',
    'Vasundhara Das', 'Gayatri Iyer', 'Sanjeevani', 'Hariharan', 'Shankar Ehsaan',
    'Sowmya', 'Chinmayi', 'Shweta Mohan', 'Andrea Jeremiah', 'Haricharan',
    'Karthik', 'Vijay Prakash', 'Blaaze', 'Clinton Cerejo', 'Neuman Pinto',
    'Sukriti Kakar', 'Prakriti Kakar', 'Akasa', 'Aastha Gill', 'Dhvani Bhanushali',
    'Tony Kakkar', 'Millind Gaba', 'Payal Dev', 'Tulsi', 'Sachin Sanghvi',
  ].map(normalizeName),
)

/// Casefold, strip punctuation and accents. Only for SET MEMBERSHIP — never
/// stored, so "A.R. Rahman" and "AR Rahman" collide without either spelling
/// being blessed as the real one.
function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/// Split a store's artist string into individual names.
///
/// Apple's format puts commas between all but the last pair and an ampersand
/// before the last: "Pritam, Arijit Singh & Shreya Ghoshal". The ampersand is
/// the awkward one — it is also part of duo NAMES ("Vishal & Shekhar", "Salim &
/// Sulaiman"), so splitting on every "&" would invent two artists who do not
/// exist. Known duos are stitched back together after the split.
export function splitArtists(raw: string): string[] {
  const parts = raw
    .split(/\s*,\s*|\s*&\s*|\s+and\s+|\s*;\s*|\s*\/\s*|\s+with\s+/i)
    .map((p) => tidy(p))
    .filter(Boolean)

  return rejoinDuos(parts)
}

/// Duo acts whose name contains an "&" that splitArtists just cut in half.
/// Keyed on the first half so the pass is a single lookahead.
const DUOS: ReadonlyArray<readonly [string, string, string]> = [
  ['Vishal', 'Shekhar', 'Vishal & Shekhar'],
  ['Salim', 'Sulaiman', 'Salim & Sulaiman'],
  ['Sachin', 'Jigar', 'Sachin-Jigar'],
  ['Meet', 'Bros', 'Meet Bros'],
  ['Amaal', 'Armaan', 'Amaal Mallik & Armaan Malik'],
]

function rejoinDuos(parts: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const duo = DUOS.find(
      ([a, b]) => normalizeName(parts[i]) === normalizeName(a) && normalizeName(parts[i + 1] ?? '') === normalizeName(b),
    )
    if (duo) {
      out.push(duo[2])
      i += 1
      continue
    }
    out.push(parts[i])
  }
  return out
}

export type CleanArtist = {
  /// The lead vocalists, at most two, in credit order.
  artist: string
  /// Everyone dropped, and why — so a reviewer can see what a row lost.
  dropped: { name: string; reason: 'composer' | 'lyricist' | 'label' | 'overflow' }[]
  /// True when the credit was nothing but labels/channels. The row has no
  /// artist and almost certainly no correct anything.
  isLabelOnly: boolean
}

/// How many vocalists survive. Two, because a duet is the largest credit a
/// player reliably holds in their head ("Arijit Singh & Shreya Ghoshal"), and
/// the third name onward on these rows is a chorus vocalist nobody would type.
const MAX_ARTISTS = 2

/// Reduce a credit list to the lead vocalists.
///
/// `featured` are merged in — a featured artist on these rows is a singer, and
/// on a `(feat. X)` single they are frequently the only one named. They go
/// AFTER the main credits so a real lead is never displaced by a guest.
export function cleanArtistCredit(raw: string, featured: string[] = []): CleanArtist {
  const dropped: CleanArtist['dropped'] = []
  const seen = new Set<string>()
  const candidates: string[] = []

  const all = [...splitArtists(raw), ...featured]
  const labelCount = all.filter((n) => NON_ARTISTS.has(normalizeName(n))).length

  for (const name of all) {
    const key = normalizeName(name)
    if (!key || seen.has(key)) continue
    seen.add(key)

    if (NON_ARTISTS.has(key)) {
      dropped.push({ name, reason: 'label' })
      continue
    }
    if (COMPOSERS.has(key)) {
      dropped.push({ name, reason: 'composer' })
      continue
    }
    if (LYRICISTS.has(key)) {
      dropped.push({ name, reason: 'lyricist' })
      continue
    }
    candidates.push(name)
  }

  // Ranking exists to CHOOSE which credits survive, so it only runs when there
  // is a choice to make. At or under the cap every candidate is kept whatever
  // the order, and sorting would do nothing but reorder a credit that was
  // already correct — turning `LSD & Sia` into `Sia & LSD` because Sia is a
  // familiar name and the group that released the track is not.
  //
  // Above the cap, established singers come first, STABLE within each group so
  // the store's order still decides between two singers of equal standing. See
  // PLAYBACK_SINGERS for why this is a sort and not a filter.
  const ranked =
    candidates.length <= MAX_ARTISTS
      ? candidates.map((name, index) => ({ name, index }))
      : candidates
          .map((name, index) => ({ name, index, known: PLAYBACK_SINGERS.has(normalizeName(name)) }))
          .sort((a, b) => (a.known === b.known ? a.index - b.index : a.known ? -1 : 1))

  const kept = ranked.slice(0, MAX_ARTISTS)
  for (const { name } of ranked.slice(MAX_ARTISTS)) dropped.push({ name, reason: 'overflow' })

  return {
    // Falling back to the raw string is deliberate. A row whose every credit
    // was a composer is a row this function does not understand, and an
    // unhelpful artist beats an empty NOT NULL column.
    artist: kept.length ? kept.map((k) => k.name).join(' & ') : tidy(raw),
    dropped,
    isLabelOnly: kept.length === 0 && labelCount > 0,
  }
}

// ---------------------------------------------------------------------------
// Movie
// ---------------------------------------------------------------------------

/// A collection that says it IS a film soundtrack. Only phrasings that name a
/// picture count — "Deluxe" and "Remastered" mark an edition, not a film.
const SOUNDTRACK_COLLECTION =
  /[([{]\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)[^)\]}]*[)\]}]|\s*[-–—]?\s*(original\s+)?(motion\s+picture\s+soundtrack|motion\s+picture|soundtrack)\s*$/i

/// Trailing store qualifiers on a collection name.
const ALBUM_TAIL = /\s+[-–—]\s+(single|ep)\s*$/i

/// The film this row is from, or null when nothing identified one.
///
/// Signal-driven on purpose, and unchanged in spirit from the rule in
/// scripts/lib/metadata.ts: a null here means "nothing said this is a film
/// track", which is the CORRECT value for the large non-film part of the
/// catalog. Guessing a film from a bare collection name would be wrong for
/// every indie single in the table, so the guess is never made — the row is
/// left for the lookup pass and, failing that, for a human.
export function deriveMovie(
  titleMovie: string | null,
  album: string | null,
): string | null {
  // The title stating its film beats the collection: a compilation carries the
  // `(From "…")` qualifier while its own name is "Bollywood Hits 2022".
  if (titleMovie) return titleMovie

  if (album && SOUNDTRACK_COLLECTION.test(album)) {
    const bare = album.replace(SOUNDTRACK_COLLECTION, ' ').replace(ALBUM_TAIL, ' ')
    return tidy(bare) || null
  }

  return null
}

/// Collapse whitespace and strip wrapping punctuation.
function tidy(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s"“'‘\-–—|,.]+|[\s"”'’\-–—|,]+$/g, '')
    .trim()
}
