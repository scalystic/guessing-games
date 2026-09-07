# Non-original tracks

41 of 675 rows are not the original studio recording of their song. Each is flagged in `Song.variantType`, so the sampler and the guess typeahead can exclude them with one predicate.

```sql
-- everything a run should skip
SELECT * FROM "Song" WHERE "variantType" IS NOT NULL;
```

| Kind | Rows | What it means |
| --- | --- | --- |
| `MISMATCH` | 5 | Not the song the title claims. Only a re-ingest fixes these. |
| `INSTRUMENTAL` | 5 | No vocals — karaoke or score. Unguessable: the lyric is the clue. |
| `MASHUP` | 2 | Two or more songs stitched together. |
| `LOFI` | 3 | Lo-fi flip or slowed + reverb. Right vocal, wrong tempo and key. |
| `REMIX` | 8 | Club or DJ re-edit of the original recording. |
| `COVER` | 2 | Re-recorded by someone other than the original artist. |
| `LIVE` | 1 | Recorded in front of an audience, not in a studio. |
| `ALTERNATE` | 15 | A sanctioned alternate cut — reprise, male/female version. |

## MISMATCH — 5

Not the song the title claims. Only a re-ingest fixes these.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Awara Paagal Deewana | Shemaroo Movies | Awara Paagal Deewana | 2002 | Awara Paagal Deewana (Original Motion Picture Soundtrack) |
| Dhadkan | Amantej Hundal & Prabh Aujla | — | 2018 | Dhadkan (feat. Prabh Aujla) - Single |
| Kalank | NIL SAGAR & Rocky Handsome | — | 2021 | Kalank (feat. Rocky Handsome & Aiswarya Khusi) - Single |
| Malang | Noor Chahal & Ezu | — | 2024 | Malang (feat. The PropheC) - Single |
| Veere Di Wedding | Vipin Sihag & Sandeep Chandel | — | 2022 | Veere Di Wedding (feat. Navya Bhalothia) - Single |

## INSTRUMENTAL — 5

No vocals — karaoke or score. Unguessable: the lyric is the clue.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Angreji Beat | Bollywood Boutique | — | 2015 | Angreji Beat (In the Style of Yo Yo Honey Singh & Gippy Grewal) [Karaoke Backing Track] - Single |
| Break Up Party | Bollywood Boutique | — | 2015 | Break Up Party (In the Style of Yo Yo Honey Singh) [Karaoke Backing Track] - Single |
| Jhoome Jo Pathaan Song | Backing Business | Pathaan | 2023 | Perfect Karaoke, Vol. 2 |
| Pairon Mein Bandhan Hai | Jatin-Lalit | Mohabbatein | 2023 | Mohabbatein: Instrumentals |
| Subhanallah | Pritam | Yeh Jawaani Hai Deewani | 2017 | Singing Strings, Vol. 2 |

## MASHUP — 2

Two or more songs stitched together.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Main Agar Kahoon-Bol Do Na Zara | Armaan Malik & Jonita Gandhi | T-Series Mixtape | 2017 | POV: You're Romantic |
| Mor Bani Thanghat Kare | Sounds of Isha & Aditya Gadhvi | Goliyon Ki Raasleela Ram-Leela | 2020 | Live at Mahashivratri 2020 |

## LOFI — 3

Lo-fi flip or slowed + reverb. Right vocal, wrong tempo and key.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Ho Gaya Hai Tujhko | Lata Mangeshkar & Udit Narayan | Dilwale Dulhania Le Jayenge | 2024 | Ho Gaya Hai Tujhko (LoFi) - Single |
| Jo Bheji Thi Dua | Deep Ocean | Zindagi Na Milegi Dobara | 2022 | Jo Bheji Thi Dua  LOFI - Single |
| Woh Lamhe Woh Baatein | Atif Aslam & Roop Kumar Rathod | Zeher | 2024 | Woh Lamhe Woh Baatein (Lofi Flip) - Single |

## REMIX — 8

Club or DJ re-edit of the original recording.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Aai Paapi | Neeraj Shridhar | Kismat Konnection | 2008 | Kismat Konnection (Original Motion Picture Soundtrack) |
| Bachna Ae Haseeno | Kishore Kumar | Hum Kisise Kum Naheen | 2007 | The Hottest Dance Mix |
| Chaar Din Ki Chandni | Shaan & Sunidhi Chauhan | Chaar Din Ki Chandni | 2012 | Chaar Din Ki Chandni (Original Motion Picture Soundtrack) |
| Kya Mujhe Pyar Hai | KK & Dj A-Myth | Woh Lamhe | 2006 | Woh Lamhe (Original Motion Picture Soundtrack) |
| Mohabbat Buri Bimari | Shalmali Kholgade | Bombay Velvet | 2015 | Bombay Velvet (Original Motion Picture Soundtrack) |
| Roop Tera Mastana | Amit Gupta | Aradhana | 2020 | Roop Tera Mastana (Remix) - Single |
| Satrangi Re | Sonu Nigam & Kavita Krishnamurthy | Dil Se | 2009 | Yo Dil Se (Remix) |
| You Don't Love Me | SICKOTOY & Roxen | — | 2019 | You Don't Love Me (feat. Roxen) [Club Edit] - Single |

## COVER — 2

Re-recorded by someone other than the original artist.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Dil Ko Tumse Pyaar Hua | Vinay Kumar | — | 2022 | Saregama Open Stage, Vol. 31 |
| Kuchh Toh Hua Hai | Ankit Tiwari | Kal Ho Naa Ho | 2016 | Bollywood Unplugged |

## LIVE — 1

Recorded in front of an audience, not in a studio.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Don | Grupo Firme & Edición Especial | — | 2021 | Don (En Vivo) - Single |

## ALTERNATE — 15

A sanctioned alternate cut — reprise, male/female version.

| Song | Artist | Film | Year | Album it came from |
| --- | --- | --- | --- | --- |
| Aankhon Mein Base Ho Tum | Abhijeet & Alka Yagnik | Takkar | 1995 | Takkar (Original Motion Picture Soundtrack) |
| Aap Se Milkar | Ayushmann Khurrana | Andhadhun | 2018 | Andhadhun (Original Motion Picture Soundtrack) |
| Ae Watan | Sunidhi Chauhan | Raazi | 2018 | Raazi (Original Motion Picture Soundtrack) - EP |
| Agar Tum Mil Jao | Roop Kumar Rathod & Shreya Ghoshal | Zeher | 2005 | Zeher (Original Motion Picture Soundtrack) |
| Bin Tere | Shekhar Ravjiani & Vishal & Shekhar | I Hate Luv Storys | 2010 | I Hate Luv Storys (Original Motion Picture Soundtrack) |
| Dulhe Ka Sehra | Nusrat Fateh Ali Khan | Dhadkan | 2000 | Dhadkan (Original Motion Picture Soundtrack) |
| Jaane Tu Mera Kya Hai | Runa | Jaane Tu... Ya Jaane Na | 2008 | Jaane Tu... Ya Jaane Na (Original Motion Picture Soundtrack) |
| Lamha Lamha | Abhijeet | Gangster | 2006 | Gangster (Original Motion Picture Soundtrack) |
| Nikamma Kiya Is Dil Ne | Himesh Reshammiya & Shaan | Kyaa Dil Ne Kahaa | 2002 | Kyaa Dil Ne Kahaa (Original Motion Picture Soundtrack) |
| O Re Bidesiya | Sukhwinder Singh | Dev.D | 2021 | 1232 Kms - Single |
| Pani Da Rang | Ayushmann Khurrana | Vicky Donor | 2012 | Vicky Donor (Original Motion Picture Soundtrack) |
| Patakha Guddi | A.R. Rahman | Highway | 2014 | Versant Vocalist a.R. Rahman |
| Rabba Ishq Na Hove | Palak Muchhal & Asees Kaur | ANDAAZ 2 | 2025 | Rabba Ishq Na Hove 2.0 (From "ANDAAZ 2") - Single |
| Rasiya | Arijit Singh | Brahmastra | 2022 | Rasiya Reprise (From "Brahmastra") - Single |
| Yaariyaan | Mohan Kannan | Cocktail | 2012 | Cocktail (Original Motion Picture Soundtrack) |

## Suspected, not confirmed — 12

These are NOT flagged in `variantType`. Each is a well-known film song credited to an unfamiliar artist and released years after the original — a strong hint, but the same description fits a legitimate independent release that reuses a common Hindi phrase as its title. Confirming one means listening to it in the hook editor. Listed so the review has a work-list instead of the whole table.

| Song | Artist | Year | Suspected | Why |
| --- | --- | --- | --- | --- |
| Chor Bazari | Golu Mast | 2019 | `COVER` | Chor Bazari — "Golu Mast", 2019, Regional Indian. The song is from Love Aaj Kal (2009), sung by Neeraj Shridhar. |
| Dilliwali Girlfriend | DJ Kushy | 2018 | `COVER` | Dilliwali Girlfriend — "DJ Kushy", 2018. The song is from Yeh Jawaani Hai Deewani (2013), sung by Arijit Singh and Sunidhi Chauhan. |
| Sach Keh Raha Hai Deewana | KK & Agsy | 2024 | `COVER` | Sach Keh Raha Hai Deewana — a 2024 single. The original is from Rehnaa Hai Terre Dil Mein (2001). KK is credited, but KK died in 2022, so a 2024 release is a reissue or a re-record around his vocal. |
| Dil Hai Tumhara | Neil Rajput | 2026 | `COVER` | Dil Hai Tumhara — "Neil Rajput", 2026, on "90s Dil Se - EP". The original is the 2002 film title track. |
| Tujhe Dekha To Ye Jaana Sanam | Ashwani Machal | 2024 | `COVER` | Tujhe Dekha To Ye Jaana Sanam — "Ashwani Machal", 2024, album "First Love". The original is from Dilwale Dulhania Le Jayenge (1995), Lata Mangeshkar and Kumar Sanu. |
| Kisi Se Tum Pyar Karo | Shubham Gupta | 2026 | `COVER` | Kisi Se Tum Pyar Karo — "Shubham Gupta", 2026 single. The original is from Mohabbatein (2000). |
| Daru Desi | Ruyal & Kashish | 2026 | `COVER` | Daru Desi — "Ruyal", 2026, genre Reggae. The original is from Cocktail (2012). |
| Woh Lamhe | Neppin Music & Rahul thapa | 2020 | `COVER` | Woh Lamhe — "Neppin Music", 2020, R&B/Soul. The original is from Zeher (2005), sung by Atif Aslam. |
| Filhaal | Towers | 2020 | `COVER` | Filhaal — "Towers", 2020. Almost certainly tracking B Praak's "Filhall" (2019) rather than the 2002 film of the same name. |
| Rehna Hai | Mohit Nayak | 2016 | `COVER` | Rehna Hai — "Mohit Nayak", 2016 single. Reads as a cut of "Rehna Hai Tere Dil Mein" (2001). |
| Deva Shree Ganesha 2 | Ravi Chopra | 2022 | `COVER` | Deva Shree Ganesha 2 — "Ravi Chopra", 2022, Devotional. The "2" suffix marks it as a derivative of the Agneepath (2012) song. |
| Sunn Zara | Wali | 2026 | `COVER` | Sunn Zara — "Wali", 2026 single. The widely known "Sunn Zara" is JalRaj/Shivin Narang, 2021. |

## Duplicates — 7 pairs

One song ingested twice, once from its soundtrack and once from a compilation. These predate this cleanup — the two rows previously had different store titles (`Dil Chahta Hai` vs `Dil Chahta Hai (From "Dil Chahta Hai")`), so normalising the titles is what made them visible. Both rows carry a distinct `externalId`, i.e. two separate audio masters. Not auto-resolved: choosing which to keep is a call about which cut is better, which needs a listen.

| Song | Artist | externalIds |
| --- | --- | --- |
| Dil Chahta Hai | Shankar Mahadevan | `9coA7bcpJII`, `IIg8H60bRJo` |
| Mujhse Shaadi Karogi | Sonu Nigam & Udit Narayan | `iCKp0SmF9T8`, `1jjDs69WWUQ` |
| Dhoom Taana | Shreya Ghoshal & Abhijeet | `C07oT0W_jU4`, `Qx8ShiEImYU` |
| Señorita | Farhan Akhtar & Hrithik Roshan | `yDv0WSgXJVg`, `1xYZeDReUz4` |
| Sooraj Dooba Hain | Arijit Singh & Aditi Singh Sharma | `nJZcbidTutE`, `jp7n5w81WDI` |
| Kar Gayi Chull | Badshah & Amaal Mallik | `iwlUeXLPvf0`, `NTHz9ephYTw` |
| Kuch Kuch Hota Hai | Udit Narayan & Alka Yagnik | `gmXlGQAg400`, `oJcE_QPFAng` |
