# 本地字体与许可

- Teaching Lab CJK（LabCJK.ttf）：Noto Sans SC的400字重中文子集，OFL 1.1。原始字体来自 https://github.com/google/fonts/tree/main/ofl/notosanssc ，保留OFL.txt、版权元数据和Noto-source.json原始哈希。子集生成器为tools/build_lab_cjk_font.py，不在用户启动时下载或生成。
- DejaVu Sans：从固定ScienceLab 3D来源仓库提取，用于拉丁文、希腊字母、化学上下标及数学符号本地回退；许可见DejaVu-LICENSE.txt，来源 https://dejavu-fonts.github.io/ 。
- Teaching Lab Rare Han：BabelStone Han 16.0.3中U+2B7F7（𫟷）单字子集，已按许可重命名；Arphic Public License全文见Arphic-LICENSE.txt，作者Andrew West与Arphic版权在字体元数据保留。原文件 https://www.babelstone.co.uk/Fonts/Download/BabelStoneHan.zip ，说明 https://www.babelstone.co.uk/Fonts/Han.html 。仅子集字形为此许可，不改变工作台其他代码许可证。
- unicode/为该罕见字的本地字体解析索引与WOFF文件；配置使用绝对本机URL，避免Worker相对地址失败后自动回退CDN。coverage.json记录实际字体字符覆盖和哈希。

没有复制上游未单列来源的HDR环境图。光照使用本地产生的环境光，无模型或纹理CDN请求。
