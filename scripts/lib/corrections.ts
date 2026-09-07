// Hand-verified corrections for rows no automated pass can fix.
//
// Everything here was looked up against a source outside the catalog —
// Wikipedia, Apple Music, the film's soundtrack listing, or in one case the
// YouTube video the row was scraped from — and each entry carries the film and
// year that source gave. This is the residue after scripts/clean-catalog.ts and
// scripts/enrich-catalog.ts: rows where the store's own metadata is absent or
// actively wrong, so there is nothing left to derive from.
//
// Two shapes, kept separate because they carry different risk.
//
//   REPAIRS  rewrite a row wholesale — title, artist, film, year. Reserved for
//            the rows scraped from a video platform, in two shapes. Either the
//            "title" was a video headline ("Kabira Yeh Jawaani Hai Deewani")
//            and the "artist" was the uploading channel ("T-Series"), or the
//            row was matched against the store on a wrong title/artist pair and
//            inherited a whole other song's album, year and genre. Either way
//            nothing in the row was this recording's metadata, so there is
//            nothing to preserve.
//
//   FILMS    add only the film to a row whose title, artist and year are
//            already right. These are film songs the store filed under a
//            compilation ("Best of Me Shaan", "Old Is Gold"), so no soundtrack
//            qualifier existed for deriveMovie() to read.
//
// Keyed by puzzleId rather than title on purpose: the catalog contains genuine
// duplicate titles, and two rows named "Rockstar" must not both be rewritten
// because one of them matched.

/// Rows where no field described this recording. See REPAIRS above.
export type Repair = {
  title: string
  artist: string
  movie: string | null
  releaseYear: number
  album: string
  genres: string[]
  /// Keep an existing review lock instead of clearing it.
  ///
  /// A repair normally unlocks the row, because on the scraped rows the review
  /// lock — when there was one — was taken against metadata that turned out to
  /// describe a different song, so the sign-off meant nothing.
  ///
  /// That reasoning does not hold when an admin locked the row after listening
  /// to the ACTUAL audio and the only thing wrong was the text around it.
  /// hookStartMs is an offset into the audio file; it does not become wrong
  /// because the title above it was. Clearing the lock there would throw away a
  /// correct human decision and queue pointless re-review work.
  keepLock?: boolean
  /// Bin the old title instead of keeping it as an alias.
  ///
  /// A repair normally files the old title under aliases, because on the scraped
  /// rows it was a video headline — clumsy, but a name this recording really was
  /// published under, and a player who types it should still match.
  ///
  /// That reasoning inverts when the old title came from a wrong STORE match: it
  /// is then the correct name of a DIFFERENT song, and the catalog may well hold
  /// that song too. Keeping it would point one title's alias at another title's
  /// row, so a player typing it gets offered a song that is not the one they
  /// named. Set this when the old title belongs to someone else.
  dropOldTitle?: boolean
  /// Where the values came from, and anything a reviewer should know.
  note: string
}

export const REPAIRS: Record<string, Repair> = {
  // "Bungee Jumping (feat. Emeli Sandé & Rahat Fateh Ali Khan)" — a wrong
  // iTunes match, not a mislabelled right one. The row's externalId is
  // 6-n_szx2XRE, which is "Rahat Fateh Ali Khan - Zaroori Tha" on YouTube, so
  // every descriptive field on it described somebody else's song.
  cmtld72ny000seskaur65i5yv: {
    title: 'Zaroori Tha',
    artist: 'Rahat Fateh Ali Khan',
    movie: null,
    releaseYear: 2014,
    album: 'Back 2 Love',
    genres: ['Pop'],
    // The admin who locked this row listened to the audio and set hookStartMs
    // from what they heard, which was Zaroori Tha. That offset is still right.
    keepLock: true,
    note: 'Non-film single from Back 2 Love (2014). Composed by Sahir Ali Bagga, lyrics Khalil-ur-Rehman Qamar. Confirmed against the row\'s own externalId, not the store. durationMs and hookStartMs describe the real audio file and are left alone.',
  },

  // "Bin Tere" / "Jawad Ahmad" — the other wrong iTunes match, and the same
  // shape as Zaroori Tha above. The row's externalId is -Q8mrKJ1Jps, whose
  // headline is "मेरे सपनो की रानी 4K - Mere Sapno Ki Rani Song - आराधना -
  // राजेश खन्ना - शर्मिला टैगोर - किशोर कुमार", so the recording is the
  // Aradhana song and every descriptive field on the row described the Woh
  // Lamhe one.
  //
  // How it happened, from api/admin/youtube/import: the importer sends the
  // title and artist it was given, then takes album, year, genre and duration
  // from searchItunes(title, artist). Given "Bin Tere"/"Jawad Ahmad" the store
  // answered with the Woh Lamhe track and the row inherited its album, from
  // which a later deriveMovie() pass read the film. One wrong pair of input
  // strings, and four fields followed it.
  cmtlgxgmk00041pka8pehc53c: {
    title: 'Mere Sapno Ki Rani',
    artist: 'Kishore Kumar',
    movie: 'Aradhana',
    releaseYear: 1969,
    album: 'Aradhana (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    // "Bin Tere" is not an old name for this recording, it is the right name of
    // a different song — and the catalog holds two rows of it already (the I
    // Hate Luv Storys track and Jawad Ahmad's "Bin Tere Kya Hai Jeena"). See
    // Repair.dropOldTitle.
    dropOldTitle: true,
    note: 'Composed by S.D. Burman, lyrics Anand Bakshi; picturised on Rajesh Khanna chasing Sharmila Tagore\'s toy train in Darjeeling. Confirmed against the row\'s own externalId, not the store. hookStartMs came from detectHookStart(videoId) and so was measured on the real audio — it survives. durationMs did NOT: 248707 is the store\'s length for Bin Tere, where the Saregama release of this song runs about 5:00, so it is still wrong and this table has no field for it. Left for the admin who auditions the hook.',
  },

  // "Hudd Hudd Dabangg Dabangg" / T-Series
  cmtjyli7l005erhk4lgxalis6: {
    title: 'Hudd Hudd Dabangg',
    artist: 'Sukhwinder Singh & Wajid',
    movie: 'Dabangg',
    releaseYear: 2010,
    album: 'Dabangg (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Composed by Sajid-Wajid, lyrics Jalees Sherwani. Title was the video headline; artist was the uploading label.',
  },

  // "Senorita Zindagi Na Milegi Dobara Full" / T-Series
  cmtjyq309006arhk4big6cz8a: {
    title: 'Señorita',
    artist: 'Farhan Akhtar & Hrithik Roshan',
    movie: 'Zindagi Na Milegi Dobara',
    releaseYear: 2011,
    album: 'Zindagi Na Milegi Dobara (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Also credits Abhay Deol and María del Mar Fernández; composed by Shankar-Ehsaan-Loy. DUPLICATE: the catalog already holds this song from the soundtrack proper — one of the two should be withdrawn.',
  },

  // "Dildara Ra.One Feat ShahRukh Khan, Kareena Kapoor" / T-Series
  cmtjyrya3006mrhk4jy1u6di8: {
    title: 'Dildaara',
    artist: 'Shafqat Amanat Ali',
    movie: 'Ra.One',
    releaseYear: 2011,
    album: 'Ra.One (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Released as "Dildaara (Stand By Me)"; choir vocals Clinton Cerejo, composed by Vishal-Shekhar. The names in the old title were the actors on screen.',
  },

  // "Criminal Ra.One" / T-Series
  cmtjys5r8006orhk459rrr1ct: {
    title: 'Criminal',
    artist: 'Akon & Vishal Dadlani',
    movie: 'Ra.One',
    releaseYear: 2011,
    album: 'Ra.One (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Also credits Shruti Pathak. Composed by Vishal-Shekhar.',
  },

  // "Ajay-Atul" / SonyMusicIndiaVEVO — the title was the COMPOSER's name and
  // nothing else. Identified from the scraped video itself (fxzk-9XJPTI),
  // whose headline is "Ajay-Atul - Gun Gun Guna Best Video | Agneepath".
  cmtjyvbbt007grhk45myinp5g: {
    title: 'Gun Gun Guna',
    artist: 'Sunidhi Chauhan',
    movie: 'Agneepath',
    releaseYear: 2012,
    album: 'Agneepath (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Recovered from the source video, not the store: the row held only the composer duo name, which matches no song. Composed by Ajay-Atul.',
  },

  // "Kabira Yeh Jawaani Hai Deewani" / T-Series
  cmtjyyxqq0088rhk44086vfya: {
    title: 'Kabira',
    artist: 'Rekha Bhardwaj & Tochi Raina',
    movie: 'Yeh Jawaani Hai Deewani',
    releaseYear: 2013,
    album: 'Yeh Jawaani Hai Deewani (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Composed by Pritam, lyrics Amitabh Bhattacharya.',
  },

  // "Panchhi Nadiya Pawan Ke Jhonke Full 1080p Song Hi Fi Sounds ( Refugee 2000 )"
  cmtk2ix4e005gtuk44jk0utew: {
    title: 'Panchhi Nadiya Pawan Ke Jhonke',
    artist: 'Sonu Nigam & Alka Yagnik',
    movie: 'Refugee',
    releaseYear: 2000,
    album: 'Refugee (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Composed by Anu Malik, lyrics Javed Akhtar; both singers Filmfare-nominated for it.',
  },

  // "Hawaon Ne Ye Kaha, Aap Mujhe Achche Lagne Lage (2002)" / Moza Series
  cmtk2n5aa006stuk40z9tfzcx: {
    title: 'Hawaon Ne Yeh Kaha',
    artist: 'Udit Narayan',
    movie: 'Aap Mujhe Achche Lagne Lage',
    releaseYear: 2002,
    album: 'Aap Mujhe Achche Lagne Lage (Original Motion Picture Soundtrack)',
    genres: ['Bollywood'],
    note: 'Composed by Rajesh Roshan, lyrics Dev Kohli. The old title was the video headline: song name, then film, then year.',
  },
}

/// Film songs the store filed under a compilation, so nothing in the row said
/// which film. Title, artist and year on these rows are already correct — only
/// the film is added.
export const FILMS: Record<string, { movie: string; note?: string }> = {
  cmtjxuey9000nrhk4gigg540u: { movie: 'Kal Ho Naa Ho', note: 'album "Kal Ona Do" is a misspelt compilation' },
  cmtjxqsri000brhk4nct0fw51: { movie: 'Mohabbatein', note: 'instrumental cut of the film score' },
  cmtjza7w4008irhk4b2xvonhb: { movie: 'Yeh Jawaani Hai Deewani' },
  cmtk2mrba006qtuk48fdc0niz: { movie: 'Aap Mujhe Achche Lagne Lage' },
  cmtk3dict00b2tuk42trgsca2: { movie: 'Anjaana Anjaani' },
  cmtlcxh4q0007eskazmyp46y7: { movie: 'Pathaan', note: 'karaoke backing track of the film song' },
  cmtldoyef001oeska39v5nc66: { movie: 'Dilwale Dulhania Le Jayenge' },
  cmtldpdkr001qeskavqpypvpl: { movie: 'Dil Se' },
  cmtldx32d002aeska6ztz5kt7: { movie: 'Kal Ho Naa Ho', note: 'unplugged re-recording' },
  cmtlemycd0042eska8vrsm1n7: { movie: 'Dev.D' },
  cmtles2w8004leska2dekumxu: { movie: 'Goliyon Ki Raasleela Ram-Leela', note: 'live garba medley built on the film song' },
  cmtlew7340054eska3qf4gfvk: { movie: 'Aradhana' },
  cmtlf0h3j0000rvka4zxpkgvk: { movie: 'Zeher' },
  cmtlf697e0007rvkavl3p2vdx: { movie: 'Hamari Adhuri Kahani' },
  cmtlel7ad003ueska315c36ry: { movie: 'Oh My Pyo Ji', note: 'album string already named the film' },
  cmtlei8rn003jeskagsrnudqb: { movie: 'Good Newwz' },
  cmtjyef3m003qrhk43rs1wvrm: { movie: 'Hum Kisise Kum Naheen', note: 'the Kishore Kumar original, on a remix compilation' },
  cmtlf3biz0005rvkajq1r14ff: { movie: 'Zindagi Na Milegi Dobara', note: 'lo-fi flip of the film song' },
}

/// Rows that are NOT the song their title claims — a different track that
/// happens to share a name, or a re-recording by an unrelated artist. Flagged
/// rather than repaired: the right master is not in the row, so only a
/// re-ingest can fix them.
export const MISLABELLED: Record<
  string,
  { variant: 'MISMATCH' | 'COVER' | 'INSTRUMENTAL'; note: string }
> = {
  cmtk2jrqr005otuk402u1xtmb: {
    variant: 'COVER',
    note: 'Album is "Saregama Open Stage, Vol. 31" — Open Stage is Saregama\'s open-submission platform where independent artists RECREATE catalog songs, so every track on it is a cover by construction.',
  },
  cmtjza7w4008irhk4b2xvonhb: {
    variant: 'INSTRUMENTAL',
    note: 'Album "Singing Strings, Vol. 2" is an instrumental guitar-cover jukebox by Vibhor Saini, and its track list names Subhanallah. Credited to Pritam because he composed the original, not because this cut is his.',
  },

  cmtk26sce0018tuk4xtq2q1v5: {
    variant: 'MISMATCH',
    note: 'A Haryanvi single by Vipin Sihag that shares a name with the 2018 film. Not the film song, not a cover of it.',
  },
  cmtk2fl4u004atuk4dlebu3wy: {
    variant: 'MISMATCH',
    note: 'A 2021 regional single by NIL SAGAR, unrelated to the 2019 film Kalank.',
  },
  cmtk2bp7q002wtuk4aoqjl4v6: {
    variant: 'MISMATCH',
    note: 'A 2024 indie-pop single, unrelated to the 2020 film Malang.',
  },
  cmtk2gmdx004otuk4xoyhlgg2: {
    variant: 'MISMATCH',
    note: 'A 2018 Punjabi single by Amantej Hundal, unrelated to the 2000 film Dhadkan.',
  },
  cmtk2nxzl0072tuk4d3u42i88: {
    variant: 'MISMATCH',
    note: 'The scraped source was a FULL FILM upload, not a song. No recording here to keep.',
  },
}

/// Rows that look wrong but that nothing available could settle.
///
/// Deliberately NOT written to variantType. Every one of these shares a shape —
/// a well-known film song, credited to an artist nobody has heard of, released
/// years after the original, on a single named after itself. That shape is a
/// strong hint and not evidence: the same description fits a legitimate
/// independent release that happens to reuse a common Hindi phrase as its
/// title, and Indian film music reuses titles constantly (see the precision
/// note at the top of scripts/detect-covers.ts, where exactly that assumption
/// produced five false positives out of seven).
///
/// Settling one means listening to it, which is what the admin hook editor is
/// for. Listed here so the review has a work-list rather than 675 rows.
export const REVIEW: Record<string, { suspected: string; why: string }> = {
  cmtjyh45t0048rhk4wuu1ghpd: {
    suspected: 'COVER',
    why: 'Chor Bazari — "Golu Mast", 2019, Regional Indian. The song is from Love Aaj Kal (2009), sung by Neeraj Shridhar.',
  },
  cmtjz1asp008crhk4oicwco41: {
    suspected: 'COVER',
    why: 'Dilliwali Girlfriend — "DJ Kushy", 2018. The song is from Yeh Jawaani Hai Deewani (2013), sung by Arijit Singh and Sunidhi Chauhan.',
  },
  cmtk2jiuw005ktuk40gmnm1zc: {
    suspected: 'COVER',
    why: 'Sach Keh Raha Hai Deewana — a 2024 single. The original is from Rehnaa Hai Terre Dil Mein (2001). KK is credited, but KK died in 2022, so a 2024 release is a reissue or a re-record around his vocal.',
  },
  cmtk2medq006ktuk4t4cvhmfj: {
    suspected: 'COVER',
    why: 'Dil Hai Tumhara — "Neil Rajput", 2026, on "90s Dil Se - EP". The original is the 2002 film title track.',
  },
  cmtldok1s001meskayzt529vd: {
    suspected: 'COVER',
    why: 'Tujhe Dekha To Ye Jaana Sanam — "Ashwani Machal", 2024, album "First Love". The original is from Dilwale Dulhania Le Jayenge (1995), Lata Mangeshkar and Kumar Sanu.',
  },
  cmtk23ise0000tuk4sahog2ah: {
    suspected: 'COVER',
    why: 'Kisi Se Tum Pyar Karo — "Shubham Gupta", 2026 single. The original is from Mohabbatein (2000).',
  },
  cmtjysuv2006urhk46pr6njv2: {
    suspected: 'COVER',
    why: 'Daru Desi — "Ruyal", 2026, genre Reggae. The original is from Cocktail (2012).',
  },
  cmtk2v98t009etuk4bnzc4auj: {
    suspected: 'COVER',
    why: 'Woh Lamhe — "Neppin Music", 2020, R&B/Soul. The original is from Zeher (2005), sung by Atif Aslam.',
  },
  cmtld12xs000geskaienuimbj: {
    suspected: 'COVER',
    why: 'Filhaal — "Towers", 2020. Almost certainly tracking B Praak\'s "Filhall" (2019) rather than the 2002 film of the same name.',
  },
  cmtk2j81y005ituk42ltfshng: {
    suspected: 'COVER',
    why: 'Rehna Hai — "Mohit Nayak", 2016 single. Reads as a cut of "Rehna Hai Tere Dil Mein" (2001).',
  },
  cmtjyv0uh007erhk47m6lz5hb: {
    suspected: 'COVER',
    why: 'Deva Shree Ganesha 2 — "Ravi Chopra", 2022, Devotional. The "2" suffix marks it as a derivative of the Agneepath (2012) song.',
  },
  cmtletgl2004seskaikz2dhkh: {
    suspected: 'COVER',
    why: 'Sunn Zara — "Wali", 2026 single. The widely known "Sunn Zara" is JalRaj/Shivin Narang, 2021.',
  },
}
