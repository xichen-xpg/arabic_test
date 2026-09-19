"""Build the checked-in 2,000-word bank from licensed, locally downloaded sources.

Usage: python tools/build_english_bank.py --data-dir .work-english
Requires opencc-python-reimplemented and pypinyin. See games/english-sources.html for sources.
The source directory must contain ecdict.csv, oxford.json, and the two OPUS files.
"""
import argparse
import csv
import hashlib
import json
import re
from functools import lru_cache
from collections import Counter, defaultdict
from pathlib import Path

from opencc import OpenCC
from pypinyin import lazy_pinyin, Style
from nltk.tag import PerceptronTagger
from nltk.tokenize import TreebankWordTokenizer
import nltk

ROOT = Path(__file__).resolve().parents[1]
TOPICS = {
    "教育与学习": "education school university student teacher lesson academic learning examination scholarship literature language teaching study training lecture college curriculum",
    "环境与能源": "environment climate energy pollution forest wildlife species animal conservation carbon fuel coal oil solar water soil waste environmental natural electricity river ocean",
    "科技与研究": "research science scientific technology computer data experiment laboratory internet software engineer device invention discovery machine electronic digital scientists",
    "经济与工作": "economic economy business company companies employee employment income investment cost price tax financial industry industrial trade money revenue market manufacturing work job workers",
    "社会与政策": "social society government policy public law legal population community democracy justice rights political authority legislation citizens welfare immigration crime court election",
    "城市与交通": "city urban transport traffic housing building construction road train bus railway airport bicycle transportation journey travel tourism passenger bridge infrastructure",
    "健康与生活": "health medical patient hospital disease medicine treatment doctor diet nutrition exercise physical mental surgery food cancer vaccine illness sleep",
    "文化与交流": "culture cultural art music language communication tradition traditional history historical museum media journalist newspaper conversation information speech audience theatre architecture",
}
TOPIC_SETS = {key: set(value.split()) for key, value in TOPICS.items()}
# Exclude simple concepts missed by the source tags, inflection-only entries,
# narrow specialist terms and duplicate US spellings of selected UK headwords.
EXCLUDE = set("""school apple book good actor adult album aim alarm animals animals ankle anybody anyhow apartment areas articles aspirin awful baby backward badminton baggage bait bald balcony banana bath beard bedroom bee belt bicycle bird blanket boat bone bottle boyfriend breakfast brush bucket butter cabbage camel camera candle candy carrot cat chair chicken cinema clever clock clothes cloudy coat coffee coin cold comb cook cooker cotton cough cow cream cry cup curtain cute daddy deer desk diary dog dollar donkey downstairs dragon dress duck ear east egg elephant eleven empty evening everybody exam eye face factory fan farmer fat father fax february female fever finger fish flag floor flower fly fog football foot forest fork forty fox fridge frog fruit furniture game garden gate gentleman girl glass glasses goat goose grade grandmother grandpa grape grass green grocery hair hamburger hand handsome hat headache heart heaven hello hen hill hobby holiday homework honey horse hotel hour hungry husband icecream illness ink jacket january jeans juice junior kettle kitchen knee knife lamp lazy lemon lion lip livingroom lunch madam mail male mango march marry maths may meat melon milk mom monkey moon morning mother mouse mouth movie mum mushroom napkin neck nephew niece night noodle nose notebook nurse nut ocean onion orange overseas ox panda pants paper park parrot pen pencil penguin pet piano pig pillow pink pizza plane playground policeman potato pretty pumpkin pupil purple rabbit radio rain rainbow rainy rice robot rose rubbish ruler sad salad salt sandwich saturday sausage schoolbag scissors sea seafood season sheep shirt shoe shorts shoulder shy sister skirt sky snake soap soccer sock sofa son soup sour spoon spring square stamp steak strawberry sugar summer sunny supermarket supper sweater swimming table taxi tea television tennis thirsty thirty thursday tiger tomato tomorrow toothbrush toothpaste tortoise towel toy trousers tuesday turtle twelve twenty uncle upstairs vegetable violin volleyball waiter waitress wallet warm wash watch watermelon weather wednesday weekend whale white wife window windy wing winter wolf woman wonderful yellow yesterday young zebra zero zodiac antelope amphibian archaeology archaeologist astrophysics barometer beetle botany calculus carnivore carnivorous centigrade chimpanzee chrysanthemum circumference crustacean dinosaur equator eucalyptus falcon fern flea fungus geometry germinate glacier granite grasshopper hemisphere herbivore hippocampus homogeneous hydrogen igloo isotope latitude longitude mammoth mercury methane microscope molecule mosquito moss nitrogen octopus palaeontology parasite penguin perpendicular photosynthesis pollen porcupine proton reptile rhinoceros salmon seagull silicon snail sodium sparrow spider squirrel subtract sulphur termite thermometer tortoise uranium vertebrate zoology abortion abort addict addiction addictive alcoholic alcoholism adultery atheist atheism bible biblical bitch brothel cannabis cocaine condom damn damned devil fuck fucking god goddess heroin intercourse lesbian marijuana naked nude pornography prostitute rape satan semen sexual sexuality shit suicide tobacco virgin virginity vodka whisky whiskey bastard cocaine fatal homosexual homosexuals masturbation penis prostitute prostitutes terrorist terrorists terrorism murder murderer murderous kill killer killing killers slain slaughter stab stabbing gun pistol rifle weapon weapons ammunition shotgun bomb bombing bombs nuclear atomic corpse coffin funeral cemetery graveyard hangman execution execute slavery slave slaves christian christianity islam muslim jewish jew judaism buddhist buddhism catholic protestant hindu hinduism jesus christ allah devil satan deity sin sinful blasphemy abortion abortionist exploitative""".split())
ALIASES = {"urbanization": "urbanisation", "globalization": "globalisation", "aging": "ageing", "enrollment": "enrolment", "well-being": "wellbeing", "labor": "labour", "behavior": "behaviour", "color": "colour", "analyze": "analyse", "analyzer": "analyser", "organization": "organisation", "organize": "organise", "center": "centre", "theater": "theatre", "liter": "litre", "meter": "metre", "defense": "defence", "offense": "offence", "license": "licence", "program": "programme", "aluminum": "aluminium"}
ALIASES.update({"characterize": "characterise", "specialize": "specialise"})
EXCLUDE.update("""pineapple popcorn jelly pudding pickle teapot teapot teacup teaspoon toast pear peach plum grapefruit raspberry coconut cucumber broccoli cauliflower spinach lettuce celery cherry walnut peanut almond raisin dolphin gorilla woodpecker cuckoo dragonfly jellyfish locust toad hare worm woolen woollen seashore seaside shopkeeper sneeze haircut handkerchief sunshine sunny rainy indoors outdoors stairway stair staircase stairway refrigerator microwave typewriter telegram lavatory noun verb alphabet thirdly mouthful belly thigh elbow pillow blanket closet skull waist liver brass copper cone trot buddy mate missus missy drowsy sleepy timid frigid curt shrill crafty stingy nasty tasty sweetness spicy juicy ripe rotten burnt backyard doorway doorstep pavement sidewalk upstairs downstairs watermelon honeycomb herring tuna sardine trout cod lobster crab shrimp prawn oyster mussel clam mussels mussel mollusk hazel cedar cricket beetle caterpillar cockroach wasp flea pigeon sparrow goose swan peacock ostrich eagle owl hawk crow bat otter beaver koala kangaroo raccoon rat lizard crocodile alligator chimpanzee gorilla chimp chimpanzees hammock quilt mitten sandal slipper blouse cardigan vest waistcoat apron underwear sock stocking robe nightgown skirt miniskirt shorts tracksuit pajamas pyjamas napkin handkerchief tissue comb razor shampoo soap detergent toothpaste toothbrush firewood coalfield kerosene treason impeach bondage moat collusion ambush tyrant beggar scripture immortality immortal patriot patriotic compatriot hoarse nimble crimson scorn scornful sly naughty greed greedy naughty shameful orphan widow orphanage honeymoon jealousy envious jealous boyfriend girlfriend groom bride bridesmaid newlywed faithful unfaithful betrayal weep sob sobbing tearful tearless unlucky fortunate lucky fortune optimist pessimist weirdo weirder weirder jack joker joker groan grumble grin wink nod shrug frown sniff yawn yawning snore snoring snort chatter mutter whisper whispering mumble muttering chatterbox mutiny mercenary musket shrapnel slaughterhouse gallows hangover alcohol whiskey whisky beer wine gin rum brandy champagne cocktail cigar cigarette tobacco pipe smoking smoker smoke tobacconist snuff ashtray firearm artillery naval navy warship combat warfare homicide firearm amnesty gallop calf foal lamb pony stallion mare donkey mule yak oxen lamb lambskin sheepskin woolen gourd garlic ginger pepper chilli chili cucumber cupboard bookshelf bookcase bookshelf armchair couch stool cushion curtain doormat rug carpet quilt duvet pillowcase mattress sheet bedsheet blanket bedspread headboard bedside upstairs downstairs bathtub washbasin basin washroom restroom toilet urinal faucet tap sink plumbing plumber electrician carpenter tailor dressmaker barber hairdresser shoemaker cobbler housemaid maid servant porter postman postwoman policeman policewoman fireman firefighter steward stewardess lifeguard cashier checkout receptionist salesperson saleswoman salesmen salesman merchant grocer butcher baker confectioner florist gardener farmer fisherman fisherwoman fisherman butcher butcher apprentice apprenticeship tricycle unicycle skateboard skateboarder scooter sled sledge sleigh toboggan canoe kayak raft sailboat yacht ferry steamer rowboat dinghy oar paddle mast rudder anchor locomotive carriage wagon trolley tram subway underground tollbooth motorway freeway highway expressway crossroads roundabout footbridge overpass underpass flyover tunnel gutter guttering sewer septic cesspit cesspool ditch puddle pothole gravel pebble cobblestone boulder limestone sandstone granite marble quartz slate chalk gypsum talc mica flint obsidian pumice basalt shale coal tar asphalt bitumen tarmac alley avenue boulevard lane culdesac cul-de-sac surname nickname birthplace hometown birthday anniversary wedding funeral cemetery coffin grave graveyard gravestone tomb tombstone mausoleum urn casket cremation burial corpse cadaver skeleton skeletal carcass flesh bloodstain bloodshed gore gory decapitate guillotine""".split())
BAD_SENTENCE = re.compile(r"\b(?:fuck\w*|shit|bitch|sex\w*|porn\w*|rape\w*|suicid\w*|murder\w*|kill\w*|slave\w*|nazi\w*|hitler|god|jesus|christ|bible|allah|devil|satan|hell|naked|drunk|stupid|idiot|ugly|fat|die|dead|dying|hate|hates|hated|gun|bomb|pistol|terror\w*|penis|breast|cocaine|heroin|marijuana|cannabis|prostitut\w*|damn\w*)\b", re.I)


def build(data_dir):
    convert = OpenCC("t2s").convert
    nltk.data.path.insert(0, str(data_dir / "nltk-data"))
    tagger = PerceptronTagger()
    tokenizer = TreebankWordTokenizer()

    @lru_cache(maxsize=None)
    def tagged(sentence):
        return tagger.tag(tokenizer.tokenize(sentence))
    with (data_dir / "ecdict.csv").open(encoding="utf-8") as source:
        dictionary = {row["word"]: row for row in csv.DictReader(source)}
    levels = json.loads((data_dir / "oxford.json").read_text(encoding="utf-8"))
    basic = {word.lower() for level in ("A1", "A2") for word in levels[level]}
    examples = defaultdict(list)
    english = (data_dir / "Tatoeba.cmn-en.en").read_text(encoding="utf-8").splitlines()
    chinese = (data_dir / "Tatoeba.cmn-en.cmn").read_text(encoding="utf-8").splitlines()
    assert len(english) == len(chinese)
    for row, (en, cn) in enumerate(zip(english, chinese), 1):
        en = en.strip()
        cn = convert(cn.strip())
        tokens = set(re.findall(r"\b[a-z]+\b", en.lower()))
        if not 5 <= len(en.split()) <= 22 or not 7 <= len(cn) <= 85:
            continue
        if not re.search(r"[.!?]$", en) or BAD_SENTENCE.search(en):
            continue
        if re.search(r"[\[\]{}<>]|https?://|\d", en) or re.search(r"[\[\]{}<>]|https?://", cn):
            continue
        if len(re.findall(r"[\u4e00-\u9fff]", cn)) < len(cn) * .65:
            continue
        for word in tokens:
            examples[word].append((en, cn, row, tokens))

    def senses(entry):
        result = []
        for line in entry["translation"].replace("\\n", "\n").splitlines():
            match = re.match(r"^(n|a|adj|adv|v|vt|vi)\.\s*(.+)", line)
            if not match:
                continue
            pos = {"a": "adj", "vt": "v", "vi": "v"}.get(match[1], match[1]) + "."
            meaning = re.sub(r"\[[^]]*\]|\([^)]*\)|（[^）]*）", "", match[2])
            chunks = [part.strip() for part in re.split(r"[,，;；]", meaning)]
            chunks = [part for part in chunks if re.search(r"[\u4e00-\u9fff]", part) and len(part) <= 14 and "=" not in part]
            if chunks:
                result.append((pos, "；".join(chunks), chunks))
        return result

    with (ROOT / "tools/english-original-examples.tsv").open(encoding="utf-8", newline="") as source:
        original = list(csv.DictReader(source, delimiter="\t"))
    bank = []
    selected = set()
    used_sentences = Counter()
    for item in original:
        word = item["word"]
        entry = dictionary.get(word, {})
        bank.append(dict(item, id=word, phonetic=entry.get("phonetic", ""), exampleSource="original", selection="雅思话题人工选词"))
        selected.add(word)

    candidates = []
    for word, entry in dictionary.items():
        tags = set(entry["tag"].split())
        if word in selected or word in basic or word in EXCLUDE or word in ALIASES:
            continue
        if not re.fullmatch(r"[a-z]{4,}", word) or "zk" in tags or not tags.intersection({"ielts", "toefl", "cet6"}):
            continue
        if "0:" in entry["exchange"] or not examples[word] or not senses(entry):
            continue
        # Omit obvious inflection-only headwords even if the dictionary has no base marker.
        if any(base in dictionary and word in dictionary[base]["exchange"] for base in (word[:-1], word[:-2], word[:-3], word[:-3] + "e")):
            continue
        frequency = int(entry["frq"] or 0) or 50000
        candidates.append((0 if "ielts" in tags else 1, frequency, word, entry))
    candidates.sort(key=lambda item: item[:3])
    for _, _, word, entry in candidates:
        options = []
        for en, cn, row, tokens in examples[word]:
            tags = [tag for token, tag in tagged(en) if token.lower() == word]
            contextual_pos = {"NN": "n.", "VB": "v.", "JJ": "adj.", "RB": "adv."}.get(tags[0][:2] if tags else "")
            for pos, meaning, chunks in senses(entry):
                if contextual_pos != pos:
                    continue
                matched = [part for part in chunks if len(part) >= 2 and len(part.replace("的", "")) >= 2 and part.replace("的", "") in cn]
                overlap = len(matched)
                if not overlap:
                    continue
                meaning = "；".join(matched[:2])
                topic_score = max(len(tokens & topic) for topic in TOPIC_SETS.values())
                score = overlap * 10 + min(topic_score, 3) * 2 - abs(len(en.split()) - 11) * .25 - used_sentences[en] * 15
                if re.search(r"\b(?:Tom|Mary|John|Boston)\b", en):
                    score -= 2
                options.append((score, en, cn, row, tokens, pos, meaning))
        if not options:
            continue
        _, en, cn, row, tokens, pos, meaning = max(options, key=lambda item: item[0])
        topic = max(TOPIC_SETS, key=lambda key: len(tokens & TOPIC_SETS[key]))
        if not tokens & TOPIC_SETS[topic]:
            topic = "表达与思辨"
        bank.append(dict(id=word, word=word, pos=pos, zh=meaning, category=topic, en=en, cn=cn,
                         phonetic=entry["phonetic"], exampleSource="tatoeba", sourceRow=row,
                         selection="雅思标签选词" if "ielts" in entry["tag"].split() else "学术英语补充"))
        selected.add(word)
        used_sentences[en] += 1
        if len(bank) == 2000:
            break
    (data_dir / "eligible.json").write_text(json.dumps(bank, ensure_ascii=False), encoding="utf-8")
    assert len(bank) == 2000, f"Only {len(bank)} eligible words; do not fill with basic words."
    assert len(selected) == len(bank)
    assert not selected.intersection({"school", "apple", "book", "good"})
    for item in bank:
        item["zhPinyin"] = " ".join(lazy_pinyin(item["zh"], style=Style.TONE))
        assert re.search(r"\b" + re.escape(item["word"]) + r"\b", item["en"], re.I), item["word"]
        assert all(item[key] for key in ("word", "pos", "zh", "en", "cn", "category"))
    output = "// Generated by tools/build_english_bank.py; sources and licences: english-sources.html\nwindow.dailyEnglishQuestionBank = "
    output += json.dumps(bank, ensure_ascii=False, indent=2) + ";\n"
    (ROOT / "games/daily-english.js").write_text(output, encoding="utf-8")
    manifest = {"count": len(bank), "originalExamples": len(original), "sources": {}, "selectionCounts": dict(Counter(item["selection"] for item in bank))}
    for name in ("ecdict.csv", "oxford.json", "Tatoeba.cmn-en.en", "Tatoeba.cmn-en.cmn"):
        manifest["sources"][name] = hashlib.sha256((data_dir / name).read_bytes()).hexdigest()
    (ROOT / "tools/english-bank-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(bank), "original": len(original), "topics": dict(Counter(item["category"] for item in bank)), "selection": manifest["selectionCounts"]}, ensure_ascii=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    build(parser.parse_args().data_dir)
