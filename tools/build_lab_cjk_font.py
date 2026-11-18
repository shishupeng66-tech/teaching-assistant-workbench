"""开发期字体子集生成器：uv run --with fonttools python tools/build_lab_cjk_font.py <原始NotoSansSC.ttf>。
原字体https://github.com/google/fonts/tree/main/ofl/notosanssc，OFL1.1；保留原始哈希及许可，不在运行时生成。
"""
import json,sys,hashlib
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset
root=Path(__file__).resolve().parents[1];base=root/'frontend/src/features/chemistry-lab/locales';target=root/'frontend/public/chemistry-lab/fonts'
text=''.join(p.read_text() for p in base.glob('*.json'));chars={ord(c) for c in text}|set(range(32,127));source=Path(sys.argv[1]);font=TTFont(source);font=instantiateVariableFont(font,{'wght':400},inplace=True)
options=subset.Options();options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*'];sub=subset.Subsetter(options);sub.populate(unicodes=chars&font.getBestCmap().keys());sub.subset(font)
for n in font['name'].names:
 if n.nameID in [1,3,4,6,16]:n.string=('TeachingLabCJK-Regular' if n.nameID==6 else 'Teaching Lab CJK').encode(n.getEncoding(),errors='replace')
 if n.nameID in [2,17]:n.string='Regular'.encode(n.getEncoding())
font.save(target/'LabCJK.ttf');(target/'Noto-source.json').write_text(json.dumps(dict(source='https://github.com/google/fonts/tree/main/ofl/notosanssc',source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),derivative='Teaching Lab CJK',weight=400,glyphs=len(font.getBestCmap()),license='OFL 1.1'),indent=2));print('CJK subset:',(target/'LabCJK.ttf').stat().st_size,'bytes')
