BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.entries WHERE id IN (326,351,353,354,367,369)) THEN
    RAISE EXCEPTION 'ENTRY_ID_CONFLICT_DETECTED';
  END IF;
END $$;

INSERT INTO public.tags (name)
SELECT name FROM (VALUES ('专利'),('翻译文档'),('造纸')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.tags t WHERE t.name = v.name);

INSERT INTO public.entries
(id, title, entry_type, summary, content, visibility, category_id, created_by, created_at, updated_at, deleted_at)
VALUES
(326, 'A mini-review on lignin isolation and modification based on sorbent materials with porous nature as demulsifier for oil/water separations', 'academic_paper', 'Imported from zaozhi\新方向调研\2025-lignin-oiland water separate-dual.pdf', '![Image](/api/images/img_1785479970587_0.png)

## Review

## A mini-review on lignin isolation and modification based on sorbent materials with porous nature as demulsifier for oil/water separations

Maged M. Basuliman a,b , Zakariyya Uba Zango c , Djalal Trache d , Mohamad Nasir Mohamad Ibrahim a , M. Hazwan Hussin a,*

- a Materials Technology Research Group (MaTReC), School of Chemical Sciences, Universiti Sains Malaysia, 11800 Minden, Penang, Malaysia
- b Department of Chemical Science, College of Science, Hadhramout University, Mukalla, Yemen
- c Department of Chemistry, Faculty of Science, Al-Qalam University Katsina, Katsina 820101, Nigeria
- d Energetic Materials Laboratory, Teaching and Research Unit of Energetic Processes, Ecole Militaire Polytechnique, BP 17, Bordj El-Bahri, Algiers 16046, Algeria

## A R T I C L E  I N F O

Keywords: Lignin-based Composites Oil/water separation Porous adsorbents Demulsification

Environmental cleanup

## 1. Introduction

Due to increasing industrial and economic expansion, oil demand has increased  significantly,  resulting  in  a  significant  increase  in  the  production of oil/water emulsions. As the global oil demand continues to rise,  the  problems  associated  with  oily  wastewater  pollution  are  expected to worsen in the coming years [1,2]. By the early 2000s, around 58 % of the global population faced some level of water scarcity and food, a figure that is predicted to rise in the future [3 -6]. These emulsions pose numerous harmful effects, including risks to human water resources, disruptions to ecosystems and the environment, and wastage of precious resources [7,8]. Specifically, the pollution caused by oily wastewater negatively impacts groundwater and drinking water quality due to its toxicity in nearly all lifestyles. It poses health risks to humans, affects agricultural productivity, damages natural landscapes, and contributes to atmospheric pollution [9 -11]. Therefore, it is imperative to enhance  Oil/water  separation  techniques,  particularly  for  stable  oil/ water emulsions that are challenging to separate due to thermodynamic

* Corresponding author. E-mail address: mhh@usm.my (M.H. Hussin).

Received 4 March 2025; Received in revised form 26 May 2025; Accepted 5 June 2025

## A B S T R A C T

Several marine oil spills and industrial wastewater discharges have posed significant threats to the environment, food systems, and human health. Waste lignin, a byproduct of the bioethanol and pulp processing industries, contains several reactive groups and is often discarded or used directly as fuel. However, lignin-based porous composites have been innovatively designed and manufactured to utilise lignin waste while also treating oily wastewater. This paper reviews recent advances in lignin isolation methods and the modification of lignin as a demulsifier  for  oil/water  separation,  focusing  on  the  production  of  lignin-based  porous  composites.  These composites are categorised into Pickering emulsions, aerogels, sponges, foams, and filter membrane materials. Additionally, the methodologies and applications of lignin based on porous adsorbents and filter materials for oil/water separation are examined. The paper investigates the characteristics of oil adsorbents and absorbents in water, evaluating their efficiency and environmental impact. An analysis of the latest literature highlights the critical  importance  of  leveraging  lignin  in  the  development  of  materials  for  demulsification  and  separation processes by exploring its chemical and physical properties.

stability [4,12 -14]. This presents a significant challenge as it reduces the availability  of  clean  water,  which  is  already  scarce  in  many  regions worldwide.  In  addition,  existing  methods  are  energy-intensive  [3], expensive [15], complex [16], and potentially environmentally harmful [17].

Oil spills, hazardous chemical leakage, petroleum extraction, storage, transportation, and international discharge have become enormous global challenges [13,17 -19]. Hence, there is a critical need for energyefficient, environmentally friendly, and cost-effective solutions in oil/ water separation processes. In recent years, according to a survey using ISI Web of Science, a skyrocketing and interesting increase in papers describing oil/water separation has been analysed, as shown in Fig. 1, which is also mainly focused on surface oil/water separation, such as superhydrophilicity, superoleophilicity, and superoleophobicity.

As a renewable, biodegradable, and abundant biopolymer derived from  biomass,  lignin  holds  significant  potential  for  developing  environmentally friendly demulsifiers and functional porous materials for oil/water separation. This review focuses on recent advances in lignin

## Contents lists available at ScienceDirect

## International Journal of Biological Macromolecules

journal homepage: www.elsevier.com/locate/ijbiomac

![Image](/api/images/img_1785479970587_1.png)

![Image](/api/images/img_1785479970587_2.png)

![Image](/api/images/img_1785479970587_3.png)

科学论文 综述

## 基于具有多孔结构的吸附材料作为破乳剂用于油水分离的木质素分离与 改性研究综述

马吉德 ·M· 巴苏利曼 a,b ，扎卡里亚 · 乌巴 · 赞戈 c ，贾拉尔 · 特拉赫 d 穆罕默德 · 纳西尔 · 穆罕默德 · 易卜拉欣 a ， M. 哈兹万 · 侯赛因 a,*

科学论文

a Materials Technology Research Group (MaTReC), School of Chemical Sciences, Universiti Sains Malaysia, 11800 Minden, Penang, Malaysia b Department of Chemical Science, College of Science, Hadhramout University, Mukalla, Yemen c Department of Chemistry, Faculty of Science, Al-Qalam University Katsina, Katsina 820101, Nigeria d

Energetic Materials Laboratory, Teaching and Research Unit of Energetic Processes, Ecole Militaire Polytechnique, BP 17, Bordj El-Bahri, Algiers 16046, Algeria

## 论文信息

## Keywords:

基于木质素的复合材料 油水分离 多孔吸附剂 破乳处理 环境治理

## 1. 引言

由于工业和经济的不断扩张，石油需求已显著增加，进而导致油水乳 液的产量大幅攀升。随着全球石油需求持续上升，未来几年与含油废水 污染相关的问题预计将更加严峻 [1,2] 。到 21 世纪初，全球约有 58% 的人口 面临不同程度的水资源短缺和粮食危机，而这一比例预计还将进一步上 升 [3 -6] 。这些乳液具有多重危害性，不仅威胁人类的水资源安全，还会 [7,8]

破坏生态系统与环境，并造成宝贵资源的浪费 。尤其值得注意的是 ，含油废水所引发的污染问题，因其在几乎所有生活场景中均具有毒性 ，对地下水及饮用水质量构成严重威胁。它不仅危及人类健康，还会影 响农业生产力，破坏自然景观，并加剧大气污染 [9 -11] 。因此，亟需加强 油水分离技术，尤其是针对那些因热力学特性而难以有效分离的稳定型 油水乳液。

* Corresponding author. E-mail address: mhh@usm.my (M.H. Hussin).

Received 4 March 2025; Received in revised form 26 May 2025; Accepted 5 June 2025

## 摘要

多起海洋石油泄漏和工业废水排放事件已对环境、食物系统及人类健康构成了严重威胁。作为生物乙醇和制浆造 纸工业的副产品，废木质素通常含有多种活性基团，但往往被直接废弃或用作燃料。然而，研究人员创新性地设 计并制造了基于木质素的多孔复合材料，不仅有效利用了废弃木质素，还能够处理含油废水。本文综述了近年来 木质素分离方法的最新进展，以及木质素作为破乳剂用于油水分离的改性技术，并重点介绍了基于木质素的多孔 复合材料的制备工艺。这些复合材料主要分为 Pickering 乳液、气凝胶、海绵、泡沫及滤膜材料等几类。此外，文章 还深入探讨了以木质素为基础的多孔吸附剂和过滤材料在油水分离中的应用方法与实际效果。同时，通过对相关 文献的分析，本文强调了在开发用于破乳及分离过程的材料时，充分利用木质素的关键作用，并深入剖析了其独 特的化学与物理特性。

稳定性 [4,12 -14] 。这构成了一个重大挑战，因为它减少了清洁水的供应 ，而全球许多地区本就面临水资源短缺的问题。此外，现有方法能耗高 [3 ] 、成本昂贵 [15] 、工艺复杂 [16] ，且可能对环境造成危害 [17] 。

石油泄漏、危险化学品泄漏、石油开采、储存、运输以及国际排放， 已成为全球性的巨大挑战 [13,17 -19] 。因此，在油水分离过程中，亟需开 发节能、环保且经济高效的解决方案。近年来，根据 ISI Web of Science 的 调查显示，有关油水分离的研究论文数量呈现迅猛增长，并展现出令人 瞩目的趋势，如图 1 所示。这些研究主要聚焦于表面油水分离技术，例如 超亲水性、超亲油性和超疏油性等特性。

作为一种可再生、可生物降解且储量丰富的生物聚合物，木质素源自 生物质，具有开发环境友好型破乳剂以及用于油水分离的功能性多孔材 料的巨大潜力。本综述重点介绍近年来木质素的最新研究进展。

## Contents lists available at ScienceDirect

## International Journal of Biological Macromolecules

journal homepage: www.elsevier.com/locate/ijbiomac extraction, modification, and application in demulsification technologies  and  highlights  the  benefits,  challenges,  and  future  directions  of lignin-centred solutions.

![Image](/api/images/img_1785479970587_4.png)

![Image](/api/images/img_1785479970587_5.png)

Fig. 1. Several articles titled '' oil/water separation '' were indexed in ISI Web of Science.

![Image](/api/images/img_1785479970587_6.png)

Several  methods  have  been  employed  to  recover  or  enhance  oil/ water  separation  from  water.  Traditional  cleanup  methods  include flotation, coagulation-sedimentation, centrifugation, biodecomposition,  in-situ  burning,  and  electrochemical  processes  [20], all of which have significant drawbacks such as high cost [21], surface turbulence, hazardous emissions from burning, and reduced efficiency at large scale [22,23]. Moreover, these methods frequently exhibit unsuitable selectivity between oil and water, hazardous sludge, produce secondary  pollutants,  and  require  intricate  operational  management with substantial energy consumption [24]. As advanced environmental regulations become stricter and sustainability targets more urgent, the limitations  of  these  traditional  approaches  reveal  a  critical  need  for high-performance alternatives that are eco-friendly and cost-effective.

In recent years, more attention has been directed toward efficient sorbent  materials  as  part  of  contemporary  oil  cleanup  strategies [25 -29],  in  addition  to  hydrogel-coated  meshes  [30],  nitrocellulose membranes [31], carbon nanotube sponges [32], and polymer-based foams  and  membranes  [33].  Conventional  absorbents  and  adsorbent materials, such as foams [34], sponges [35], aerogels, activated carbon [36], biomass fibres [37,38], resins, zeolites, and nanoparticles, can be broadly classified as either water-sorbing (hydrophilic) or oil-sorbing (hydrophobic).  These  materials  are  promising  due  to  their  selective interaction with oil or water; however, limitations such as low adsorption capacity and limited recyclability remain challenges [13,39,40].

Recent  developments  have  introduced  advanced  materials  with specialised surface wettability for more selective oil/water separation to address these shortcomings. While some of these can separate stable emulsions, including those with droplet sizes below 1.0 μ m, many still face  challenges  related  to  complex  fabrication  and  modification  processes [33,41 -43]. Additionally, 3D porous foams and sponges continue to draw global attention due to their high porosity, low density, large surface area, and high oil sorption capacity [44].

Various  methods  have  been  established  for  generating  organic porous crystal material (OPC) membranes with multiple attributes to utilise  membrane  separation  broadly.  OPC  membranes  are  attractive choices for membrane separation due to their organised pore structure, changeable surface, high porosity, and sustained thermal and chemical stability. OPC membranes have demonstrated outstanding performance in water treatment, dyeing wastewater treatment, heavy metal removal, saltwater desalination, and oil/water separation. In membrane separation technology, features including low density, large specific surface area, easily configurable pore size and shape, and simplicity of functionalization have all been extensively utilised [45].

Biomass  polymeric  materials  such  as  cellulose  and  lignin  have attracted  substantial  interest  due  to  their  excellent  biocompatibility, biodegradability,  and  renewability  [46,47].  They  are  applied  as  solubilisers, thickeners, and destabilisers for demulsifying systems due to their  inherent  features,  such  as  multiple  functional  groups,  complex conformational  changes  at  the  oil  interface,  and  viscosity  reduction [48].  Water-soluble  lignin  derivatives  can  be  used  as  demulsifying agents  to  increase  the  interfacial  tension  between  oil  and  water  and destabilise  liquid liquid  mixtures  by  forming  steric  interfacial  films [48].

According to reports, the pulp and paper industry uses only 2 % of the 50 million tons of lignin produced annually, with the other lignin being burned or disposed of in landfills [49]. To create new materials and polymers, lignin extraction from different lignocellulose biomass was  also  quantitatively  carried  out  [50].  This  idea  motivated  the development of a unique method for separating oil from water through carbonisation  in  the  lignin -carbon  foam  synthesised  by  hydrocarbon compounds [22,51].

The name lignin comes from the Latin lignum, which means wood [52].  The  phenolic  macromolecule  containing  three  phenylpropane units  (monolignols)  is  responsible  for  the  neutral  hydrophobicity  of lignin-based polymers [53]. By layer-by-layer construction, lignin, an anionic polyelectrolyte, can be combined with a cationic polyelectrolyte to modify polymeric membranes with a negatively charged surface [54]. Liquid has recently been developed into flocculants, adsorbents, and membrane filters  to  remediate  contaminated  water  [29].  Adsorbents that remove dyes, medications, and heavy metals include flocculants based on lignin [55,56].

Similar to porous adsorbents, lignin-based adsorbents can be created via modification procedures to remove heavy metal ions in water. By expanding the surface area, ion exchange can increase the adsorption of heavy metals on lignin [57]. An anionic virus has been eliminated from lignin by flocculation and filtering using glycidyltrimethylammonium chloride  [58].  Lignin-containing  polyurethane/lignin composite foam was created by blending and then polymerising. After adding lignin, the hydrophobic polyurethane foam changed into a hydrophilic composite foam  [59].  The  oil  absorption  from  water  into  the  composite  foam increased, and the composite foam showed excellent reusability. Fig. 2 displays a schematic indication of porous lignin-based materials for oil/ water separation.

In  summary,  it  demonstrates  how  rising  industrial  and  economic growth is responsible for the rising demand for oil and the consequent rise  in  oil/water  emulsions.  It  is  backed  up  by  reliable  sources  that emphasise the problems associated with water shortages and the detrimental  effects  of  oily  effluent  on  the  environment,  agriculture,  and public health. The thorough examination of several conventional and cutting-edge oil/water separation processes highlights the shortcomings of existing approaches and the demand for more effective ones. Accurate presentations of current research trends are made, highlighting the potential advantages of lignin-based materials. Therefore, this work aims to summarise recent advances in lignin-based materials and discuss their opportunities, impediments, and future potential in oil/water separation applications.

## 1.1. Lignin

Lignin is a complex and diverse polymer composed of phenylpropane units  interconnected  by  diverse  chemical  bonds.  Due  to  its  intricate structure,  it  presents  significant  challenges  in  depolymerisation  and conversion into valuable products [60,61]. Moreover, its composition varies considerably based on its origin, such as hardwood, softwood, or grasses, adding complexity to its utilisation processes.

Addressing these challenges requires interdisciplinary research efforts involving materials science, chemistry, chemical engineering, and biotechnology. Moreover, lignin production takes place in the secondary cell walls of plant tissues and is a complicated and strictly regulated process [62,63]. Collaborative efforts between academia, industry, and government agencies are crucial for accelerating the development and commercialisation of lignin utilisation technologies. Unlocking the full potential of lignin as a sustainable feedstock producing fuels, chemicals,

图 1 。在 ISI Web of Science 中检索到多篇题为''油水分离''的文章。

![Image](/api/images/img_1785479970587_7.png)

提取、改性及其在破乳技术中的应用，并重点阐述了以木质素为核心解 决方案的益处、挑战及未来发展方向。

为了从水中回收或强化油水分离，人们已采用多种方法。传统的清理 方法包括浮选、混凝 -沉淀、离心分离、生物降解、原位燃烧以及电化学 工艺 [20] ，但这些方法均存在显著缺陷，如成本高昂 [21] 、易引发表面湍 流、燃烧过程产生有害排放，且在大规模应用时效率降低 [22,23] 。此外 ，这些方法往往难以实现油水之间的高效选择性分离，还会产生危险的 污泥，并可能释放二次污染物；同时，它们通常需要复杂的操作管理， 能耗巨大 [24] 。随着日益严格的环保法规和更加紧迫的可持续发展目标， 这些传统方法的局限性凸显出：亟需开发性能卓越、环境友好且经济高 效的替代方案。

近年来，随着现代石油清理策略的不断发展，高效吸附材料日益受到 关注 [25-29] ，此外，水凝胶涂层网格 [30] 、硝酸纤维素膜 [31] 、碳纳米管 海绵 [32] ，以及基于聚合物的泡沫和膜材料 [33] 也备受瞩目。传统吸油剂 和吸附材料，如泡沫 [34] 、海绵 [35] 、气凝胶、活性炭 [36] 、生物质纤维 [3 7,38] 、树脂、沸石及纳米颗粒等，可大致分为亲水性（吸水）或疏水性

（吸油）两类。这些材料因其对油或水的高选择性相互作用而展现出广 阔的应用前景，但低吸附容量和回收利用率有限等局限性仍是亟待解决 的挑战 [13,39,40] 。

近期的进展引入了具有特殊表面浸润性的先进材料，以实现更高效的 油水分离，从而克服这些不足。尽管其中一些材料能够分离包括滴径小 于 1.0 微米的稳定乳液在内的复杂体系，但许多材料仍面临复杂制备与改 性工艺方面的挑战 [33,41 -43] 。此外，三维多孔泡沫和海绵因其高孔隙率 、低密度、大表面积以及卓越的油吸附能力，持续受到全球关注 [44] 。

已建立了多种方法，用于制备兼具多重优异性能的有机多孔晶体材料 （ OPC ）膜，以推动膜分离技术的广泛应用。由于 OPC 膜具有规整的孔道 结构、可调控的表面特性、高孔隙率以及卓越的热稳定性和化学稳定性 ，因此成为膜分离领域的理想选择。实验证明， OPC 膜在水处理、印染 废水处理、重金属去除、海水淡化及油水分离等领域均展现出非凡的性 能。此外，在膜分离技术中， OPC 膜还因其低密度、大比表面积、易于 调节的孔径与孔形，以及简便的功能化修饰等独特优势而备受青睐 [45] 。

生物质聚合材料，如纤维素和木质素，因其优异的生物相容性、生物 降解性和可再生性而备受关注 [46,47] 。这些材料被用作增溶剂、增稠剂 以及用于破乳体系的稳定剂，以实现其功能。

其固有特性，如多种功能基团、油界面处复杂的构象变化以及粘度降低 [4 8] 。水溶性木质素衍生物可用作破乳剂，通过在油水界面形成空间位阻的 界面膜，增强油水之间的界面张力，从而破坏液 -液混合体系的稳定性 [48 ] 。

据报道，纸浆和造纸行业每年生产的 5000 万吨木质素中，仅使用了其 中的 2% ，其余木质素则被焚烧或填埋处理 [49] 。此外，为了开发新型材 料和聚合物，研究人员还对来自不同木质纤维素生物质的木质素进行了 定量提取 [50] 。这一思路促使人们研发出一种独特的方法：通过碳化作用 ，利用烃类化合物在木质素基碳泡沫中实现油水分离 [22,51] 。

木质素这一名称源自拉丁语 lignum ，意为''木材'' [52] 。这种含有三 个苯丙烷单元（单体木质素）的酚类大分子，正是赋予基于木质素的聚 合物中性疏水性的关键 [53] 。通过逐层构建的方法，带负电的木质素聚电 解质可与阳离子聚电解质结合，从而制备出表面带负电荷的改性聚合物 膜 [54] 。近年来，液态产品已被开发用于生产絮凝剂、吸附剂及膜过滤器 ，以有效处理受污染的水体 [29] 。其中，以木质素为基础的絮凝剂尤其擅 长去除染料、药物和重金属等污染物 [55,56] 。

与多孔吸附剂类似，基于木质素的吸附剂可通过改性工艺制备，用于 去除水中的重金属离子。通过扩大表面积，离子交换作用可增强木质素 对重金属的吸附能力 [57] 。此外，一种阴离子病毒已成功利用氯化缩水甘 油基三甲基铵进行絮凝和过滤，从木质素中被彻底清除 [58] 。研究人员还 通过混合与聚合过程，制备了含木质素的聚氨酯 / 木质素复合泡沫材料。 值得注意的是，添加木质素后，原本疏水性的聚氨酯泡沫转变为亲水性 复合泡沫 [59] 。这种复合泡沫不仅显著提升了对水体中油类物质的吸收性 能，还表现出优异的可重复使用性。图 2 展示了用于油水分离的多孔木质 素基材料的示意图。

总之，本文阐明了工业与经济的持续增长如何推动了对石油需求的上 升，并由此导致了油水乳液的增加。研究还引用了可靠的数据来源，强 调了水资源短缺所带来的问题，以及含油废水对环境、农业和公众健康 造成的严重负面影响。通过对多种传统及前沿油水分离技术的深入分析 ，本文指出了当前方法的不足之处，并突出了开发更高效分离技术的迫 切需求。同时，文章准确梳理了当前的研究趋势，重点介绍了基于木质 素材料在这一领域可能具有的独特优势。因此，本研究旨在总结近年来 木质素基材料的最新进展，并探讨其在油水分离应用中的潜在机遇、面 临的挑战及未来的发展前景。

## 1.1. Lignin

木质素是一种复杂且多样的聚合物，由苯丙烷单元通过多种化学键相 互连接而成。由于其结构极为复杂，木质素在解聚及转化为高价值产品 的过程中面临重大挑战 [60,61] 。此外，木质素的组成还因其来源不同而 差异显著，例如硬木、软木或草类，这进一步增加了其利用过程的复杂 性。

应对这些挑战需要跨学科研究，涉及材料科学、化学、化学工程以及 生物技术等多个领域。此外，木质素的生成过程发生在植物组织的次生 细胞壁中，是一个复杂且受到严格调控的过程 [62,63] 。为了加速木质素 利用技术的研发与商业化进程，学术界、工业界及政府机构之间的协作 至关重要。只有充分挖掘木质素作为可持续原料的巨大潜力，才能实现 其在燃料和化学品生产中的广泛应用。

Fig. 2. Schematic indication of porous lignin-based materials for oil/water separation.

![Image](/api/images/img_1785479970587_8.png)

and materials requires advances in catalyst design, process optimisation, and biomass pretreatment techniques [64 -66].

Although lignin has great potential as a feedstock for many highvalue  goods,  many  obstacles  prevent  its  effective  use  [67].  Understanding the intricacies of lignin biosynthesis is crucial for manipulating its properties and developing strategies for its controlled degradation or modification.

Although lignin is abundant, it has long been an enigma to scientists owing to its intricate structure and resistance to degradation. Understanding  lignin''s  characteristics  and  uses  has  become  increasingly

Fig. 3. Three main hydroxycinnamyl alcohol monomer units are crosslinked to produce the lignin structure, creating the equivalent units in lignin.

![Image](/api/images/img_1785479970587_9.png)

图 2. 用于油水分离的多孔木质素基材料示意图。

![Image](/api/images/img_1785479970587_10.png)

以及材料，这需要催化剂设计、工艺优化和生物质预处理技术的进展 [64 -66] 。

尽管木质素作为多种高附加值产品的重要原料具有巨大潜力，但许多 障碍阻碍了其有效利用 [67] 。深入了解木质素生物合成的复杂机制，对于 实现对其的精准调控至关重要。

其特性及其用于可控降解或改性的开发策略。

尽管木质素储量丰富，但由于其复杂的结构和难以降解的特性，长期 以来一直困扰着科学家。如今，深入理解木质素的特性和应用变得愈发 重要。

图 3 。三种主要的羟基肉桂醇单体单元通过交联反应生成木质素结构，从而形成木质素中的等效单元。

![Image](/api/images/img_1785479970587_11.png)

important.  In  recent  years,  interest  has  increased  in  investigating  its potential  applications  beyond  its  conventional  uses  in  a  variety  of sectors.

With lignin, hemicellulose, and cellulose intertwined at 1 -30%, and 1 -43%, 35 -83% dry weight basis, respectively, along with a few other compounds  [68](xylose,  arabinose,  tannin,  etc.),  the  lignocellulose biomass is a composite of biopolymers that leads to relatively low concentrations of lignin-derived monomers  in  the reaction mixture [38,69 -71].

It  is  created by enzymatic radical polymerisation of three distinct phenolic  monomers  ( n = 0 -2),  which  are  distinguished  from  one another by the number of methoxy substituents on the aromatic ring. Three primary units make up the resultant polymer: p -hydroxyphenyl (H), syringyl (S), and guaiacyl (G), Fig. 3 [72]. The different C -C and C -O bonding motifs that have been identified in lignin structures are the result of the oxidising equivalent delocalizing around the monomer after radical initiation until a crosslink is created with a neighbouring radical on the developing polymer [69,73]. Phenolic and non-phenolic chemicals are the main enzymes involved in the synthesis of lignocellulose biomass [74].

One of the second-most-prevalent organic molecules on the planet, lignin is predicted to become a crucial raw material for the manufacturing of bioproducts shortly. Lignin, which is mostly present in the cell walls of vascular plants, is essential for giving plant tissues their stiffness and structural stability [67].

Researchers are studying lignin as a viable feedstock for the synthesis of high-value compounds such as biofuels and bioplastics [64 -66,71,75,76]. The food and pharmaceutical industries are showing interest in lignin''s potential uses due to its antibacterial and antioxidant qualities [77 -79]. Furthermore, creating renewable and biodegradable substitutes for traditional plastics appears to be aided by lignin-based polymers.

Lignin''s resistance to depolymerisation makes it difficult to convert it into  useful  products  effectively  [80].  The  variety  of  lignin  structures adds  to  the  material''s  special  qualities  and  resistance  to  microbial deterioration [81].

The high physical porosity of lignin refers to the large number of pores or open spaces in its structure. These pores come in various of sizes and shapes, offering a large surface area for molecular interactions [55]. Because  of  these  characteristics,  lignin  can  take  part  in  physical adsorption methods that remove contaminants from water.

However, lignin has a distinct structure and set of functional properties, including the ability to absorb certain heavy metal ions due to its carbonyl, methoxyl, and alcohol hydroxyl groups [26]. Since lignin is not  very  effective  at  eliminating  pollutants  from  aqueous  cultures, compounds based on lignin have been modified or recombined to increase the removal power of pollutants [82]. Researchers are becoming more and more interested in the lignin modification process because modified lignin exhibits a significant attraction to certain contaminants found in wastewater.

## 1.2. Lignin isolation

The  conventional  techniques  employed  in  the  paper  industry  to extract lignin from lignocellulose feedstock are frequently comparable. These  techniques  can  be  generically  categorised  as  chemical  or  mechanical extraction based on the lignin and other by-products (such as cellulose and hemicellulose) that are to be used. Because of the excess lignin produced by industry and its potential as a renewable resource through biorefineries, research has recently focused on turning lignin into valuable chemicals and converting biomass''s lignocellulose into a variety of valuable products like food, feed, chemicals, materials, biofuels, and energy [69].

Sulfur lignin and sulfur-free lignin are the two types of lignin. In recent years, a new class of greener solvents has been assessed for the treatment of biomass, separating its constituent parts and, in certain situations, extracting significant amounts of lignin [67]. Summarises the various lignin extraction and separation procedures and lists the key operating parameters for each. The first kind of lignin, which includes sulfite and Kraft lignin, is mostly derived from industrial pulping operations. Soda pulping and solvent pulping are two methods that still need to be commercially used to produce the second form of lignin. Lastly, a new generation of hydrolysed lignin offers significant new prospects for industrial production in areas like the synthesis of bioethanol to replace fossil fuel-based transportation fuels. They could be from non-wooded or wooded areas [83].

The ultimate lignin structure, purity, and related qualities are greatly influenced by the pulping process (delignification) and the botanical source  used  in  the  extraction  methods  [84].  Common  pulping  techniques involve breaking apart ester and ether bonds, and the resulting technical lignin is very different from lignin found in plants [69]. The division into two primary categories, sulfur and sulfur-free processes, respectively, is displayed in Table 1.

## 1.2.1. Sulfur lignin

Although lignosulfonates include much sulfur in the form of sulfonate groups on their aliphatic side chains, they are soluble in water [85]. It is the most widely used technical lignin because of these qualities in a variety of industrial applications, including binders [86]. Due to these properties,  it  represents  the  most  exploited  technical  lignin  in  many industrial applications, such as, for example, binders [87], dispersing agents  [88],  surfactants  [89],  adhesives  [90],  and  cement  additives [91]. They are typically tainted, nevertheless, by the cations used in the manufacture  and  recovery  of  pulp.  They  are  considerably  cationdependent in their reactivity [92]. Whereas compounds based on calcium and ammonium exhibit the highest and lowest reactivity, respectively, lignosulfonates based  on  sodium  and  magnesium  exhibit intermediate reactivity [69].

One type of lignin that comes from the kraft pulping process, which is frequently used in the paper industry to make pulp from wood, is called kraft lignin [93]. In the Kraft process, wood chips are treated at high pressure and temperatures using a hydrolytic solution of sodium hydroxide and sodium sulfide [94]. Through this process, the lignin in the wood is broken down and separated from the cellulose fibres.

## 1.2.2. Sulfur-free lignin

There are two primary types of sulfur-free lignin: lignin derived from alkaline pulping (soda lignin) and lignin from solvent pulping (organosolv lignin). Their tiny macromolecular size and intriguing characteristics can render them a desirable source of aromatic compounds or low-molecular-mass phenol.

Organosolv lignins are often the best quality and purest. Their low molecular  weight,  few  structural  alterations,  and  hydrophobic  lignin make them nearly insoluble in water and highly soluble in organic solvents [95]. Soda lignin may become industrially available soon [83]. Furthermore, compared to native lignin, kraft and soda lignins have a higher  number  of  hydroxyl  groups  and  comparatively  more  carbon -carbon linkages [96].

Enzymatic sulfur-free pulp and paper manufacturing offers a promising  path  forward  for  sustainable  pulp  and  paper  production  by lowering the dependency on free sulfur-containing materials, supporting ecologically  friendly  delignification  techniques,  and  requiring  less energy.

For enterprises hoping to use lignin as efficiently and productively as possible, breaking it down into usable components can be challenging. On the other hand, studies have discovered enzymes, particularly those generated  by  bacteria  and  fungus,  that  are  capable  of  efficiently degrading lignin. These microbes, which include bacteria and fungi, are essential  for  breaking  down  lignin  during  the  processing  of  biomass [97].

Ionic  liquids  include  unique  characteristics  that  enable  them  to effectively dissolve or convert biomass into various compounds. Ionic

重要。近年来，人们对其在多个领域超越传统用途的潜在应用的兴趣日 益增加。

木质素、半纤维素和纤维素以 1% ～ 30% 、 1% ～ 43% 及 35% ～ 83% （干 重 basis ）的比例相互交织，此外还包含少量其他化合物 [68] （如木糖、 阿拉伯糖、单宁等）。这种木质纤维素生物质是由多种生物聚合物组成 的复合材料，因此在反应体系中木质素衍生单体的浓度相对较低 [38,69 -7 1] 。

本文通过三种不同酚类单体的酶促自由基聚合反应生成，这些单体彼 此区别在于芳环上甲氧基取代基的数量。最终形成的聚合物由三种基本 单元组成：羟基苯基（ H ）、丁香基（ S ）和愈创木基（ G ），如图 3 所示 [ 72] 。在木质素结构中已鉴定出的多种 C-C 和 C-O 键合模式，实际上是由于 单体在自由基引发后，其周围的氧化还原等效电子发生离域化，直至与 正在生长的聚合物上相邻的另一个自由基形成交联键 [69,73] 。此外，参 与木质纤维素生物量合成的主要酶包括酚类和非酚类化合物 [74] 。

地球上第二种最普遍的有机分子之一--木质素，预计将在不久后成 为生物制品制造领域的重要原料。木质素主要存在于维管植物的细胞壁 中，是赋予植物组织刚性和结构稳定性的关键成分 [67] 。

研究人员正在研究木质素，将其作为合成高附加值化合物（如生物燃 料和生物塑料）的可行原料 [64 -66,71,75,76] 。由于木质素具有抗菌和抗 氧化特性，食品和制药行业对其潜在用途表现出浓厚兴趣 [77 -79] 。此外 ，利用基于木质素的聚合物，似乎有助于开发可再生且可生物降解的传 统塑料替代品。

木质素对解聚作用的抵抗性使其难以有效转化为有用产品 [80] 。此外 ，木质素结构的多样性进一步增强了这种材料的独特性能及其抗微生物 降解的能力 [81] 。

木质素的高物理孔隙率指的是其结构中存在大量孔隙或开放空间。这 些孔隙具有多种大小和形状，为分子间的相互作用提供了巨大的表面积 [5 5] 。正是由于这些特性，木质素能够参与物理吸附法，有效去除水中的污 染物。

然而，木质素具有独特的结构和一系列功能性特性，包括由于其羰基 、甲氧基及醇羟基而具备吸附某些重金属离子的能力 [26] 。由于木质素在 去除水体培养液中的污染物方面效果并不理想，研究人员已对基于木质 素的化合物进行改性或重组，以增强其对污染物的去除能力 [82] 。目前， 越来越多的研究人员开始关注木质素的改性过程，因为经过改性的木质 素对废水中某些特定污染物表现出显著的亲和力。

## 1.2. Lignin isolation

造纸行业中用于从木质纤维素原料中提取木质素的传统技术通常具有 可比性。这些技术可根据所要利用的木质素及其他副产品（如纤维素和 半纤维素）的性质，被统称为化学法或机械法提取。由于工业生产过程 中产生了大量木质素，并且其作为可再生资源可通过生物精炼厂加以利 用，近年来的研究重点已转向如何将木质素转化为高附加值化学品，以 及如何将生物质中的木质纤维素进一步加工成多种高价值产品，例如食 品、饲料、化工品、材料、生物燃料和能源等 [69] 。

硫基木质素和无硫木质素是两种类型的木质素。近年来，一类新型更 环保的溶剂已被评估，用于生物质的处理，以分离其组成成分，并在某 些情况下

科学论文 在某些情况下，可提取出大量木质素 [67] 。本文总结了多种木质 素提取与分离工艺，并列出了每种工艺的关键操作参数。第一类木质素 主要来源于工业制浆过程，包括亚硫酸盐法和硫酸盐法木质素。而碱法 制浆和溶剂法制浆则是目前仍需进一步实现商业化应用以生产第二类木 质素的两种方法。最后，新一代水解木质素为工业化生产提供了重大机 遇，特别是在生物乙醇合成领域，有望替代基于化石燃料的交通燃料。 这些木质素既可能来自非木材区域，也可能来自木材区域 [83] 。

木质素的最终结构、纯度及其相关特性，很大程度上受到制浆过程（ 脱木素）以及提取方法中所用植物原料的影响 [84] 。常见的制浆技术包括 断裂酯键和醚键，而由此得到的技术木质素与植物体内天然存在的木质 素截然不同 [69] 。表 1 展示了制浆工艺主要分为两大类：含硫工艺和无硫 工艺。

## 1.2.1. Sulfur lignin

尽管木质素磺酸盐在其脂肪族侧链上以磺酸根形式含有大量硫，但它 们却能溶于水 [85] 。由于这些优良特性，木质素磺酸盐成为应用最广泛的 工业用木质素，广泛应用于多种工业领域，如粘合剂 [86] 。正是凭借这些 独特性能，它在许多工业应用中成为被开发利用最多的工业木质素，例 如用作粘合剂 [87] 、分散剂 [88] 、表面活性剂 [89] 、胶黏剂 [90] 以及水泥添 加剂 [91] 等。然而，这类产品通常会受到制浆与纸浆回收过程中所用阳离 子的污染，其反应活性也因此显著依赖于阳离子类型 [92] 。其中，以钙和 铵为基础的化合物分别表现出最高和最低的反应活性，而以钠和镁为原 料的木质素磺酸盐则展现出中等程度的反应活性 [69] 。

一种源自硫酸盐制浆工艺的木质素，该工艺在造纸工业中被广泛用于 从木材中制取纸浆，被称为硫酸盐木质素 [93] 。在硫酸盐法制浆过程中， 木片会在高温高压条件下，经由氢氧化钠和硫化钠的水解溶液处理 [94] 。 通过这一过程，木材中的木质素被分解，并与纤维素纤维分离出来。

## 1.2.2. Sulfur-free lignin

有两种主要类型的无硫木质素：一种源自碱法造纸工艺（烧碱木质素 ），另一种来自溶剂法造纸工艺（有机溶剂法木质素）。它们具有微小 的巨分子尺寸和引人注目的特性，因此可成为生产芳香族化合物或低分 子质量酚类物质的理想来源。

有机溶剂法木质素通常品质最佳、纯度最高。它们分子量低、结构变 化少，且具有疏水性，因此几乎不溶于水，却极易溶于有机溶剂 [95] 。碱 法木质素有望很快实现工业化应用 [83] 。此外，与原生木质素相比，硫酸 盐法和碱法木质素的羟基数量更多，同时碳 -碳键连接也相对更为丰富 [96 ] 。

酶法无硫制浆造纸技术为可持续的制浆造纸生产提供了一条充满前景 的路径，它降低了对含游离硫材料的依赖，支持环保型脱木素工艺，并 且所需能源更少。

对于希望尽可能高效、高产地利用木质素的企业而言，将其分解为可 再利用的组分可能颇具挑战性。另一方面，研究已发现一些酶，尤其是 由细菌和真菌产生的酶，能够高效降解木质素。这些微生物，包括细菌 和真菌，是生物质加工过程中分解木质素的关键 [97] 。

离子液体具有独特的特性，使其能够高效地溶解或转化生物质，生成 多种化合物。

| Ref. [85,247]                                                                                      | [248,249]                                                                                                                                                                                                            | [112,247,250] [83,251,252]                                                                                                                            | [93,97,98] [98,168,253]                                                                                            |
|----------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| Disadvantages High sulfur & High ash content, Less purity, High carbohydrate content, Nonselective | separation. Moderate sulfur content, Long processing time, High carbohydrate content, without selective separation/purification High operational cost, High solvent cost, Additional recovery of Hydrophobic lignin, | Pilot production scale High carbohydrate content, High delignification agent consumption, High heterogeneity of product Long term processing          | Carbohydrate consumption by bioreagents High operational cost (high reagent cost) Additional stages for separation |
| Advantages Water-soluble, Soluble in polar organic solvents, Used on mostly wood biomass           | Ideal for lignin removal, Low ash content, Alkali and organic solvent, soluble lignin used on mostly wood biomass Sulfur-free, Low molecular weight, Low changes to structure, Hydrophobic lignin                    | Sulfur-free, Low catalyst inhibitors content, Low ash content, Used on mostly non-wood biomass Sulfur free                                            | Low energy cost Sulfur free Minimal changes to the structure                                                       |
| Wt Product molecular weight Lignosulfonate Lignin                                                  | Medium molecular weight Kraft Lignin molecular weight Organosolv lignin                                                                                                                                              | molecular weight Soda lignin Enzymatic lignin                                                                                                         | Fungi or bacteria Medium molecular weight to medium molecular weight Ionic liquid lignin                           |
| pH Process 1-2 Hydrolytic process NaOH and Na 2 SO 3, ◦                                            | 120 - 180 C 12- 13 Hydrolytic process NaOH and Na 2 S, 150 - 180 ◦ C                                                                                                                                                 | 13 Hydrothermal process Organic solvent (Acetic Acid, Formic Acid, Water, Ethanol) , 90 - 210 ◦ C 11- 13 Hydrolytic alkali process NaOH, 90 - 150 ◦ C | Biological process, low temp. Hydrothermal process, 100 - 170 ◦ C                                                  |
| Sulfite                                                                                            | Kraft                                                                                                                                                                                                                | Pulping Soda Pulping Enzymatic                                                                                                                        | Ionic                                                                                                              |
|                                                                                                    |                                                                                                                                                                                                                      | Solvent                                                                                                                                               | liquids                                                                                                            |
| Lignin Extract Processes                                                                           |                                                                                                                                                                                                                      |                                                                                                                                                       |                                                                                                                    |

liquids  can  help  break  down  biomass  into  valuable  products  by  dissolving or separating its primary components, cellulose, hemicellulose, and lignin [98]. Based on how well they dissolve the various components  of  biomass,  they  can  be  categorised:  some  dissolve  lignin  and hemicellulose,  some  dissolve  lignin,  and  others  dissolve  cellulose exclusively. Ionic liquids that effectively lower the resistivity of different kinds of biomass are listed in Table 1 [99].

Lignin  extractions  and  mill  effluents  are  characterised  by  their chemical content of suspended solids, organic matter, and dyes attributable to lignin and lignin derivatives. In addition, power plant effluents have  a  high  conductivity  due  to  the  chemical  compounds  used  in pulping,  adsorbable  organic  halogens,  and  chemicals  from  the  wood (phytosterols, fatty acids, and resin acids) [100]. To reduce the environmental impact of lignin pulp, modern lignin pulp production utilises chemical recovery systems, advanced biological and membrane-based wastewater treatments, and a shift to cleaner methods such as enzymatic or organosolv pulping [101,102]. These approaches reduce toxic emissions, recycle chemicals and improve sustainability.

Furthermore, several environmentally friendly techniques for extracting  lignocellulose  have  been  developed,  including  hot  water [103], supercritical fluid [103], deep eutectic solvent [104], and combination  pretreatment  techniques.  These  techniques  are  designed  to maximize processing efficiency and mitigate severe reaction conditions.

## 2. Modification of lignin as a demulsifier (chemical/physical)

Lignin modification has been a vital way of improving the properties of lignin-based materials for various applications. The modification allows for the introduction of new functionality or the alteration of the existing features of the lignin materials. Thus, they allow the endowing of  the  materials  with  unique  and  additional  features  to  meet  the  requirements for specific applications. Different physical, chemical, and biological treatment strategies have been adopted to modify the lignin''s structure, reactivity, solubility, and compatibility to suit specific applications [105,106]. It is possible to change lignin in many ways to make lignin-based materials with different functions and features that can be changed to work better in industrial settings [107]. Thus, the modification allows for lignin-based material development, possessing ideal features such as enhanced thermal stability [108], excellent mechanical strength [109], good biodegradability [109,110], and other desirable characteristics.

Modified lignin is made for oil/water separation, utilising its unique properties. The naturally occurring polymer lignin, which is abundant in biomass and is known for its affinity for organic compounds, is also known for being hydrophobic and having the ability to absorb oil [53]. Moreover, because lignin is abundant, inexpensive, biodegradable, stable when producing nanoparticles as a reducing agent, non-toxic, sustainable, and environmentally benign, these studies have concentrated on using it as a demulsifier for oil/water separation.

Lignin structure includes both hydrophobic and hydrophilic groups. The hydrophobic structure is due to its aromatic structure, methoxyl groups,  aliphatic  (non-aromatic)  side  chains,  cross-linking,  and  the limited exposure of hydrophilic groups [111]. By attaching to the oil droplets'' surfaces, lignin can help coalesce smaller droplets into larger ones, which can then separate more easily from the water phase. Hence, the lignin structure is hydrophilic due to its hydroxyl groups, carboxyl groups,  ether  linkages  ( -O -),  and  phenolic  hydroxyl  groups  [112]. This amphiphilic nature allows lignin to interact with both oil and water molecules.

Some frequently used modification processes for lignin demulsification applications are acetylation, methylation, hydrolysis, oxidation, sulfonation,  and  polymer  grafting.  By  modifying  its  characteristics, lignin can better suit various industrial applications, such as water and oil separations, adhesives, and more [113], and in the manufacturing of paints,  polymers,  medicines,  and  composite  materials.  For  example, introducing additional functional groups to lignin through oxidation and

1

e

l

b

a

T

.

n

i

n

g

i

l

m

r

o

f

s

e

s

s

e

c

o

r

p

e

e

r

f

-

r

u

f

l

u

s

d

n

a

r

u

f

l

u

s

,

s

e

i

r

o

g

e

t

a

c

n

i

a

m

o

w

t

o

t

n

i

n

o

i

t

a

c

fi

i

s

s

a

l

c

e

h

t

s

w

o

h

S

| R e f .                         | [ 8 5 , 2 4 7 ]                                                                   | [ 2 4 8 , 2 4 9 ]                                                                     |                                                                                     | [ 1 1 2 , 2 4 7 , 2 5 0 ]                                                     |                                                                                         |                                         |                                       | [ 8 3 , 2 5 1 , 2 5 2 ]                                                 |                                                                                      |                                             | [ 9 3 , 9 7 , 9 8 ]                               | [ 9 8 , 1 6 8 , 2 5 3 ]                                                 |                                                           |
|---------------------------------|-----------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------|-------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|-----------------------------------------|---------------------------------------|-------------------------------------------------------------------------|--------------------------------------------------------------------------------------|---------------------------------------------|---------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------------------|
| D i s a d v a n t a g e s       | a n i c H i g h s u l f u r & H i g h a s h c o n t e n t , L e s s p u r i t y , | o n t e n t , M o d e r a t e s u l f u r c o n t e n t , L o n g p r o c e s s i n g | l i g n i n t i m e , H i g h c a r b o h y d r a t e c o n t e n t , w i t h o u t | L o w H i g h o p e r a t i o n a l c o s t , H i g h s o l v e n t c o s t , | l i g n i n A d d i t i o n a l r e c o v e r y o f H y d r o p h o b i c l i g n i n , | P i l o t p r o d u c t i o n s c a l e |                                       | c o n t e n t , H i g h c a r b o h y d r a t e c o n t e n t , H i g h | o n - w o o d d e l i g n i fi c a t i o n a g e n t c o n s u m p t i o n , H i g h | h e t e r o g e n e i t y o f p r o d u c t | L o n g t e r m p r o c e s s i n g               | H i g h o p e r a t i o n a l c o s t ( h i g h r e a g e n t c o s t ) | A d d i t i o n a l s t a g e s f o r s e p a r a t i o n |
| r o d u c t A d v a n t a g e s | L i g n o s u l f o n a t e W a t e r - s o l u b l e , S o l u b l e             | K r a f t L i g n i n I d e a l f o r l i g n i n r e m o v a                         | A l k a l i a n d o r g a n i c s o l v                                             | O r g a n o s o l v S u l f u r - f r e e , L o w m o l e c u                 | g n i n c h a n g e s t o s t r u c t u r e , H                                         |                                         |                                       | S o d a l i g n i n S u l f u r - f r e e , L o w c a t a l y s         | L o w a s h c o n t e n t , U s e d o                                                | b i o m a s s                               | E n z y m a t i c l i g n i n S u l f u r f r e e | I o n i c l i q u i d S u l f u r f r e e                               | l i g n i n M i n i m a l c h a n g e s t o t h e         |
| M w . W t P                     | H i g h m o l e c u l a r                                                         | M e d i u m                                                                           | m o l e c u l a r w e i g h t                                                       | L o w m o l e c u l a r                                                       | w e i g h t l i                                                                         |                                         |                                       | L o w m o l e c u l a r                                                 | w e i g h t                                                                          |                                             | F u n g i o r b a c t e r i a                     | L o w t o m e d i u m                                                   | m o l e c u l a r w e i g h t                             |
| P r o c e s s                   | H y d r o l y t i c p r o c e s s                                                 | H y d r o l y t i c p r o c e s s                                                     | N a O H a n d N a 2 S ,                                                             | H y d r o t h e r m a l p r o c e s s                                         | O r g a n i c s o l v e n t                                                             | ( A c e t i c A c i d , F o r m i c     | A c i d , W a t e r , E t h a n o l ) | H y d r o l y t i c a l k a l i                                         | p r o c e s s                                                                        | N a O H , 9 0 - 1 5 0 ◦ C                   | B i o l o g i c a l p r o c e s s , l o w         | H y d r o t h e r m a l p r o c e s s ,                                 | 1 0 0 - 1 7 0 ◦ C                                         |
| p H                             | S u l fi t e 1 - 2                                                                | K r a f t 1 2                                                                         | 1 3                                                                                 | S o l v e n t 1 3                                                             | P u l p i n g                                                                           |                                         |                                       | S o d a 1 1                                                             | P u l p i n g 1 3                                                                    |                                             | E n z y m a t i c                                 | I o n i c                                                               | l i q u i d s                                             |
| S u l f u r                     | P r o c e s s e s                                                                 |                                                                                       |                                                                                     | S u l f u r F r e e                                                           | r o c e s s e s                                                                         |                                         |                                       |                                                                         |                                                                                      |                                             |                                                   |                                                                         |                                                           |
| L i g n i n                     | E x t r a c t                                                                     |                                                                                       |                                                                                     |                                                                               | P                                                                                       |                                         |                                       |                                                                         |                                                                                      |                                             |                                                   |                                                                         |                                                           |

液体可以通过溶解或分离生物质的主要成分--纤维素、半纤维素和木质 素，帮助将生物质分解为高价值产品 [98] 。根据它们对生物质各组分的溶 解能力，这些液体可被分为几类：有些能同时溶解木质素和半纤维素， 有些仅能溶解木质素，而另一些则专门用于溶解纤维素。表 1 列出了能够 有效降低不同类型生物质电阻率的离子液体 [99] 。

科学论文 木质素提取物和制浆废水的特点是其化学成分中含有的悬 浮固体、有机物以及因木质素及其衍生物而产生的染料。此外，电厂废 水由于制浆过程中使用的化学物质、可吸附性有机卤素以及木材本身释 放的化学物质（如植物甾醇、脂肪酸和树脂酸）而具有较高的电导率 [100 ] 。为降低木质素浆对环境的影响，现代木质素浆生产广泛采用化学回收 系统，并结合先进的生物法和膜法污水处理技术，同时积极转向更清洁 的制浆方法，例如酶法或有机溶剂法制浆 [101,102] 。这些措施不仅减少 了有毒排放，还实现了化学品的循环利用，显著提升了生产的可持续性 。

此外，已开发出多种环境友好的木质纤维素提取技术，包括热水法 [10 3] 、超临界流体法 [103] 、深共晶溶剂法 [104] ，以及组合预处理技术。这 些技术旨在最大限度地提高加工效率，并有效缓解苛刻的反应条件。

## 2. 木质素作为破乳剂的改性（化学 / 物理）

木质素改性已成为提升基于木质素材料性能、满足多种应用需求的重 要途径。通过改性，可以在木质素材料中引入新的功能，或对其现有特 性进行调整，从而赋予材料独特且额外的功能，以更好地适应特定应用 的要求。目前，人们已采用多种物理、化学和生物处理策略，对木质素 的结构、反应活性、溶解性及相容性进行改性，以满足不同应用场景的 需求 [105,106] 。此外，还可以通过多种方式对木质素进行改造，开发出 具备多', 'internal', 3, NULL, '2026-07-31T06:39:30.653Z'::timestamptz, '2026-07-31T06:39:30.653Z'::timestamptz, NULL),
(351, 'CN201610046821.8_一种选择性制备1-羟基-2,5-己二酮及2,5-呋喃二甲醇的方法', 'patent', 'Imported from md: CN201610046821.8_一种选择性制备1-羟基-2,5-己二酮及2,5-呋喃二甲醇的方法.md', '# Pages: 20



---



---



---



---



---



---



---



---



---



---



---



---



---



---



---



---



---



---



---

', 'internal', 4, NULL, '2026-07-31T08:10:45.428Z'::timestamptz, '2026-07-31T08:10:45.428Z'::timestamptz, NULL),
(353, 'CN201710768995.X_一种1,10-癸二酸的制备方法', 'patent', 'Imported from md: CN201710768995.X_一种1,10‑癸二酸的制备方法.md', '# Pages: 15



---



---



---



---



---



---



---



---



---



---



---



---



---



---

', 'internal', 4, NULL, '2026-07-31T08:11:52.787Z'::timestamptz, '2026-07-31T08:11:52.787Z'::timestamptz, NULL),
(354, 'CN201810321005.2_一种正辛醇酯及其正辛醇的制备方法', 'patent', 'Imported from md: CN201810321005.2_一种正辛醇酯及其正辛醇的制备方法.md', '# Pages: 8



---



---



---



---



---



---



---

', 'internal', 4, NULL, '2026-07-31T08:11:53.283Z'::timestamptz, '2026-07-31T08:11:53.283Z'::timestamptz, NULL),
(367, 'CN201710451177.7_一种间羟基苯乙酮的制备方法', 'patent', 'Imported from md: CN201710451177.7_一种间羟基苯乙酮的制备方法.md', '# CN201710451177.7_一种间羟基苯乙酮的制备方法

原始文件：zaozhi\CN201710451177.7_一种间羟基苯乙酮的制备方法.pdf

该 PDF 未能自动提取文本（可能为扫描件）。
', 'internal', 4, NULL, '2026-07-31T08:28:38.628Z'::timestamptz, '2026-07-31T08:28:38.628Z'::timestamptz, NULL),
(369, 'Decarbonization pathways for the pulp and paper industry: A comprehensive review', 'academic_paper', 'Imported from pdf: 2025_Decarbonization pathways-dual.pdf', '![Image](/api/images/img_1785487540829_0.png)

Contents lists available at ScienceDirect

## Renewable and Sustainable Energy Reviews

journal homepage: www.elsevier.com/locate/rser

## Decarbonization pathways for the pulp and paper industry: A comprehensive review

![Image](/api/images/img_1785487540829_1.png)

Farhan Haider Joyo

a,* , Benedetto Nastasi b , Davide Astiaso Garcia a

![Image](/api/images/img_1785487540829_2.png)

- a Department of Astronautical, Electrical and Energy Engineering, Sapienza University of Rome, Italy

b Department of Industrial Engineering, Tor Vergata University of Rome, Italy

A R T I C L E  I N F O

Keywords: Pulp and paper industry Industrial decarbonization Climate change Net-zero emission Analytical hierarchy process (AHP)

Multi-criteria decision making (MCDM)

## 1. Introduction

There  is  growing  attention  towards  decarbonizing  the  industrial sector to reduce dependence on fossil fuels, reduce negative environmental  impacts,  and  find  new  energy  sources  to  achieve  climate neutrality by 2050, as per the Paris Agreement [1]. Energy-intensive industries (EIIs) such as iron &amp; steel, cement, pulp &amp; paper, and chemicals are a significant part of the economy and are responsible for a large amount of energy consumption, resource use, and emissions [2]. Globally, EIIs are responsible for approximately 30 % of the total greenhouse gas (GHG) emissions [3]. Studies have identified energy efficiency, the use of best available technologies (BATs), and fuel switching towards renewable energy sources as the best pathways in reducing energy demand and cutting emissions from the industrial sector [4,5].

A B S T R A C T

The world is experiencing the effects of climate change at an increasing rate, including rising average global temperature, caused primarily by greenhouse gas (GHG) emissions. Energy-intensive industries (EIIs) are major contributors to greenhouse gas emissions. The pulp and paper industry (PPI) is among the top five most energyintensive industries, and it accounts for approximately 6 % of global industrial energy use and 2 % of direct industrial CO2  emissions. Therefore, it is important to decarbonize this industrial sector to achieve the climate policy goal of achieving net-zero emissions as per the Paris Agreement. This paper presents a comprehensive review of the decarbonization options, also known as decarbonization pathways, for the pulp and paper industrial sector. These pathways are selected from available literature, and they mainly include energy efficiency measures (EEMs), paper recycling, switching to carbon-neutral fuels such as biomass and hydrogen, electrification of heat supply, and carbon capture &amp; storage (CCS), among other emerging technologies. After identifying, each decarbonization pathway is discussed in detail with its drivers and barriers to implementation. The Analytical Hierarchy Process AHP, a multi-criteria decision-making MCDM technique, is carried out to rank the decarbonization pathways on five distinct criteria: cost, emission reduction potential, technological readiness level  (TRL),  implementation time, and scalability. The ranking is carried out in four distinct criteria weight regimes to present clear choices on different criterion weights. This review paper aims to add to the existing literature to provide clear indications in choosing the pathways toward the decarbonization effort in the pulp &amp; paper industry under various strategic priorities.

Additionally, enhancing circularity through recycling is identified as a significant decarbonization option for the EIIs [6]. The paper-making industry accounts for 6 % of global industrial energy consumption and is responsible for 2 % of direct industrial CO2  emissions (Fig. 1). The global demand and production of pulp and paper are expected to increase significantly by 2050 [7], which will drive up associated energy use and GHG emissions. Thus, to achieve the climate policy objective of achieving net-zero CO2  emissions globally by 2050, decarbonizing the pulp and paper industry (PPI) is essential [8]. The PPI, due to its heterogeneity, manufactures a range of products including tissue papers, currency notes, printing paper, packaging paper, and paper used for banners, displays, and advertisements. The annual production of PPI stands at over 400 million tons of paper and is expected to nearly double by 2050, in response to rising demand [9]. The major energy-consuming

This article is part of a special issue entitled: SDEWES2024 published in Renewable and Sustainable Energy Reviews.

* Corresponding author. Department of Astronautical Electrical &amp; Energy Engineering (DIAEE), Sapienza University of Rome, Italy.

E-mail  addresses: farhanhaider.joyo@uniroma1.it (F.H.  Joyo),  benedetto.nastasi@outlook.com (B.  Nastasi),  davide.astiasogarcia@uniroma1.it (D.  Astiaso Garcia).

## [https://doi.org/10.1016/j.rser.2025.116070](https://doi.org/10.1016/j.rser.2025.116070)

1364-0321/© 2025 The Authors. Published by Elsevier Ltd. This is an open access article under the CC BY-NC-ND license (  http://creativecommons.org/licenses/bync-nd/4.0/ ).

![Image](/api/images/img_1785487540829_3.png)

![Image](/api/images/img_1785487540829_4.png)

![Image](/api/images/img_1785487540829_5.png)

## Contents lists available at ScienceDirect

## Renewable and Sustainable Energy Reviews

journal homepage: www.elsevier.com/locate/rser

## 纸浆与造纸行业的脱碳路径：全面综述

法尔汉 · 海德尔 · 乔约 a,* ， 贝内德托 · 纳斯塔西 b ，大卫 · 阿斯蒂亚索 · 加西亚 a

科学论文 a

Department of Astronautical, Electrical and Energy Engineering, Sapienza University of Rome, Italy b Department of Industrial Engineering, Tor Vergata University of Rome, Italy

## 论文信息

## Keywords:

造纸与纸浆工业 行业脱碳 气候变化 净零 排放 层次分析法（ AHP ） 多准则决策方 法（ MCDM ）

## 1. 引言

根据《巴黎协定》 [1] ，当前社会各界日益关注工业领域的脱碳进程， 旨在减少对化石燃料的依赖、降低负面环境影响，并寻找新的能源来源 ，以实现到 2050 年气候中立的目标。钢铁、水泥、纸浆与造纸以及化工 等能源密集型产业（ EIIs ）是经济的重要组成部分，同时这些行业也占据 了大量能源消耗、资源使用及排放的比重 [2] 。在全球范围内，能源密集 型产业的温室气体（ GHG ）排放量约占总排放量的 30%[3] 。研究表明， 提高能效、采用最佳可用技术（ BATs ），以及向可再生能源转型，是降 低工业部门能源需求、有效削减排放的最佳途径 [4,5] 。

## 摘要

全球正以越来越快的速度感受到气候变化的影响，其中最显著的表现是全球平均气温持续上升，而这主要是由温 室气体（ GHG ）排放所引发的。能源密集型产业（ EIIs ）是温室气体排放的重要来源之一。在这些产业中，制浆造 纸工业（ PPI ）位居能源最密集的五大行业之列，其能耗约占全球工业总能耗的 6% ，并直接贡献了约 2% 的工业二 氧化碳排放。因此，为实现《巴黎协定》提出的净零排放气候政策目标，推动该工业部门的脱碳进程至关重要。 本文全面回顾了制浆造纸工业领域可用的多种脱碳方案，即所谓的脱碳路径。这些路径均基于现有文献精心筛选 ，主要包括：提高能源效率措施（ EEMs ）、纸张回收利用、改用生物质和氢气等碳中性燃料、供热系统电气化， 以及碳捕集与封存（ CCS ）等新兴技术。在明确各条脱碳路径后，本文还深入探讨了每种路径的实施驱动因素与障 碍。此外，本文采用多准则决策方法--层次分析法（ AHP ），从成本、减排潜力、技术成熟度（ TRL ）、实施周 期及可扩展性这五个关键维度对脱碳路径进行了综合排序。为了便于根据不同战略优先级灵活选择合适的脱碳路 径，本文还在四种不同的权重组合下分别进行了排名分析。本综述旨在丰富现有文献，为制浆造纸行业在不同战 略重点下的脱碳努力提供清晰的决策指引。

此外，通过回收利用提升循环性被确认为能源与工业一体化企业（ EIIs ） 实现显著脱碳的重要选项 [6] 。造纸行业占全球工业能耗的 6% ，并直接贡 献了 2% 的工业 CO 排放（图 1 ）。预计到 2050 年，全球纸浆和纸张的需求 与产量将大幅增长 [7] ，这将进一步推高相关能源消耗和温室气体排放。 因此，为实现到 2050 年全球净零 CO 排放的气候政策目标，对纸浆与造纸 工业（ PPI ）进行脱碳转型至关重要 [8] 。由于 PPI 具有高度多样性，其产 品种类丰富，涵盖面巾纸、货币纸币、印刷纸、包装纸，以及用于横幅 、展示和广告的各类纸品。目前， PPI 的年产量已超过 4 亿吨，且随着需 求持续攀升，预计到 2050 年这一数字将几乎翻一番 [9] 。主要的能源消耗 行业

This article is part of a special issue entitled: SDEWES2024 published in Renewable and Sustainable Energy Reviews.

* Corresponding author. Department of Astronautical Electrical &amp; Energy Engineering (DIAEE), Sapienza University of Rome, Italy.

E-mail  addresses: farhanhaider.joyo@uniroma1.it (F.H.  Joyo),  benedetto.nastasi@outlook.com (B.  Nastasi),  davide.astiasogarcia@uniroma1.it (D.  Astiaso Garcia).

Received 26 January 2025; Received in revised form 26 June 2025; Accepted 7 July 2025

1364-0321/© 2025 The Authors. Published by Elsevier Ltd. This is an open access article under the CC BY-NC-ND license (  http://creativecommons.org/licenses/bync-nd/4.0/ ).

![Image](/api/images/img_1785487540829_6.png)

![Image](/api/images/img_1785487540829_7.png)

processes in PPI include black liquor evaporation, chemical pulp making, and the drying of paper [10]. The environmental emissions of the PPI are also significant, and specific factors such as high-temperature heat  demand,  process  emissions,  and  the  long  life  of  the  industrial plants make it challenging to mitigate these emissions [3]. The PPI has the potential to significantly reduce its energy consumption (Fig. 1) by implementing efficient and  sustainable  technologies.  The  main  roadmaps for decarbonizing the pulp and paper industry, as presented by the Confederation of European Paper Industry (CEPI) [11], include energy efficiency measures (EEMs), fuel switching, electrification of heat supply,  and  emerging  technologies  such  as  carbon  capture  and  storage (CCS).  This  review  aims  to  evaluate  the  potential  of  the  pathways available in the literature to achieve the goal of decarbonization in the PPI.

## 1.1. Overview of pulp and paper production process

The primary source (raw material) for the PPI is wood and wood residues,  which  must  contain  high  levels  of  cellulose  to  meet  the lignocellulosic biomass standards [12]. Recovered paper is also utilized by the PPI, which is obtained from the activities of waste management. The two most crucial stages in the production of pulp and paper are pulping and papermaking. Pulping is the process of breaking down raw materials into cellulose fibers, and papermaking involves converting the pulp into thin sheets of paper through the pressing and drying processes. These processes demand significant amounts of resources and energy inputs to be carried out effectively [13]. Pulping can be carried out using two  processes:  mechanical  pulping  and  chemical  pulping.  Through mechanical procedures in the mechanical pulping, cellulose fibers are primarily separated, resulting in the transformation of around 95 % of the wood into pulp [14]. The lignin tends to cause yellowing of mechanical pulp; therefore, mechanical pulping is primarily utilized for producing  products  with  a  shorter  lifespan,  such  as  newsprints  and magazine  paper  [15].  The  process  of  chemical  pulping  involves  the separation of cellulose fibers from lignin and other wood components using chemicals, which typically include sodium hydroxide and sodium sulfide  (kraft  pulping).  This  results  in  paper  with  improved  qualities such as increased strength and brightness, but with a lower yield of around 40 -55 %, due to the dissolution of lignin [16]. A key feature of kraft pulping is the recovery of spent cooking liquor, known as black liquor, which is burned as biofuel to generate steam and electricity for the mill. Different varieties of boards, fine paper, and sack paper products commonly utilize chemical pulp. Chemical pulping processes are predominantly used for producing pulp in the EU [14]. According to the estimates, over 90 % of the global pulp production is accounted for by kraft pulping [17].

After pulping, the pulp may be bleached (for high-brightness paper grades) and then goes to the paper machine. The process of papermaking involves five  main  steps.  Initially,  the  pulp  is  mixed  with  water  and additives in stock preparation and then refined, screened, and deinked to attain the desired properties. In the next stage, the wire section, the water is eliminated through the application of gravitational forces and vacuuming.  Following  the  wire  section,  the  damp  paper  is  passed through the press section, where water is removed mechanically. At this juncture, depending on the design of the press section and the grade of paper, the dry solid content ranges from 33 % to 55 % [18]. In the fourth stage  of  paper  production,  the  remaining  water  is  removed  through thermal  means  in  the  pre-drying  section.  Depending  on  the  desired product specifications, the paper may undergo a sizing step involving substances such as starch, glue, or coating. In case a second drying stage is required, a small amount of moisture, typically between 5 % and 9 %, remains in the paper even after drying. Then the paper sheet goes for finishing, which involves calendering and reeling. Fig. 2 illustrates the processes of virgin pulp-based and recycled paper mills, highlighting the key stages from raw material input to paper drying, including pulping, refining, deinking, pressing, and drying.

Fig. 3 illustrates a simplified block layout of the papermaking processes  along  with  the  energy  consumption share, and Table 1 shows specific electricity and heat consumption for each process.

The PPI is unique in a way that, unlike other heavy industries (such as steel or cement) that rely predominantly on fossil fuels, the PPI sector utilizes a significant share of biofuels and waste for its energy needs. These include biomass residues and process waste such as black liquor, barks,  and  wood  scraps.  Black  Liquor  is  a  carbon-rich  by-product  of chemical pulping, which is used as fuel on-site in the recovery boilers to generate steam and electricity, reducing reliance on fossil fuels [25]. This intrinsic use of biomass has allowed the sector to decouple energy use from production growth to some extent. For instance, in the EU, a 23 % increase in paper output over two decades saw only a 1 % increase in energy use, due to high utilization of bioenergy and by-product utilization [26]. In contrast, more fossil-fuel-dependent industries do not share  this  advantage,  meaning  that  decarbonization  of  PPI  involves distinct considerations. The PPI '' s challenge is not only to replace fossil fuel use, but also to improve the sustainability of biofuel use itself. This involves ensuring biomass is sourced with minimal land-use change and biodiversity impacts, and maximizing energy efficiency to optimally use these resources.

## 1.2. Pulp and paper industry production &amp; CO2 emission status

The global industry produced 43.5 billion tons of CO2e GHG emissions, around 4.2 % of global GHG emissions derived from human activities,  between  1961  and  2019  [27].  The  PPI  is  the  fourth  largest industrial  energy  user  and  generates  1.3  %  of  global  GHG  emissions PPI 中的工艺包括黑液蒸发、化学浆制造以及纸张干燥 [10] 。此外， PPI 的 环境排放也十分显著，尤其是高温热需求、过程排放，以及工业设施本 身寿命较长等特定因素，使得降低这些排放面临巨大挑战 [3] 。通过采用 高效且可持续的技术， PPI 有望大幅减少其能源消耗（图 1 ）。欧洲造纸 工业联合会（ CEPI ）提出的推动制浆造纸行业脱碳的主要路径包括：实 施能效措施（ EEMs ）、燃料转换、供热系统电气化，以及碳捕集与封存 （ CCS ）等新兴技术。本综述旨在评估文献中现有路径实现 PPI 脱碳目标 的潜力。

Fig. 1. Industrial CO2  emissions and final energy consumption shares by sector.

![Image](/api/images/img_1785487540829_8.png)

## 1.1. Overview of pulp and paper production process

PPI 的主要原料（原始材料）是木材及其残留物，这些原料必须含有 高含量的纤维素，以满足木质纤维生物质的标准 [12] 。此外， PPI 还会利 用回收纸，而这些回收纸则来源于废弃物管理活动。在制浆造纸过程中 ，最关键的两个阶段是制浆和造纸。制浆是将原材料分解成纤维素纤维 的过程，而造纸则是通过压榨和干燥工序，将纸浆转化为薄薄的纸张。 这两个过程都需要大量资源和能源投入，才能高效完成 [13] 。制浆方法主 要有两种：机械制浆和化学制浆。其中，机械制浆主要通过机械处理手 段分离纤维素纤维，使约 95% 的木材转化为纸浆 [14] 。然而，木质素容 易导致机械浆泛黄，因此机械制浆通常用于生产寿命较短的产品，如新 闻纸和杂志纸 [15] 。相比之下，化学制浆则借助化学药剂（如氢氧化钠和 硫化钠，即硫酸盐法制浆）将纤维素纤维与木质素及其他木材成分彻底 分离。这种方法生产的纸张品质更优，强度更高、亮度更好，但同时纸 浆得率较低，仅约为 40% 至 55% ，因为部分木质素被溶解掉了 [16] 。值 得一提的是，硫酸盐法制浆的一大特色在于能够回收废液--黑液，并将 其作为生物燃料燃烧，为工厂提供蒸汽和电力。目前，各类纸板、高级 纸以及包装用纸产品普遍采用化学浆。而在欧盟地区，化学制浆工艺更 是占据了全球纸浆生产的主导地位 [14] 。据估算，全球超过 90% 的纸浆 产量均由硫酸盐法制浆法贡献 [17] 。

## 制浆后，纸浆可进行漂白（用于生产高亮度纸张）

等级）后，进入造纸机。造纸过程主要包括五个主要步骤：首先，在浆 料制备阶段，将纸浆与水及添加剂混合，并经过打浆、筛选和脱墨处理 ，以达到所需的纸张性能；接着，在网部，通过重力作用和真空抽吸， 去除纸浆中的水分；随后，湿纸幅被送入压榨部，利用机械方式进一步 脱水；此时，根据压榨部的设计及纸张等级的不同，纸页的干固含量通 常介于 33% 至 55% 之间 [18] 。在造纸工艺的第四阶段，剩余的水分通过热 力手段在预干燥部被彻底去除。根据最终产品规格的要求，纸张可能还 需进行施胶处理，使用淀粉、胶料或涂料等物质。如果需要第二道干燥 工序，则即使经过干燥，纸张中仍会残留少量水分，一般为 5% 到 9% 左右 。最后，纸幅进入精整工序，包括压光和卷取等环节。图 2 展示了以原生 浆和再生浆为基础的造纸厂工艺流程，清晰地标注了从原料投入到纸张 干燥的关键步骤，涵盖打浆、打浆细化、脱墨、压榨及干燥等核心环节 。

图 3 展示了造纸工艺的简化流程布局及其能耗占比，而表 1 则列出了各 工序的具体电能和热能消耗量。

PPI 的独特之处在于，与其他主要依赖化石燃料的重工业（如钢铁或 水泥行业）不同， PPI 行业在其能源需求中大量使用生物燃料和废弃物， 包括生物质残余物以及黑液、树皮和木材边角料等工艺废料。其中，黑 液是化学制浆过程中的富碳副产品，被直接用作厂内回收锅炉的燃料， 用于生产蒸汽和电力，从而有效减少了对化石燃料的依赖 [25] 。正是这种 对生物质的内在利用，使该行业在一定程度上实现了能源消耗与生产增 长的脱钩。例如，在欧盟，过去二十年间纸张产量增长了 23% ，但能源消 耗仅增加了 1% ，这主要得益于生物能源的高效利用及副产品的大规模回 收利用 [26] 。相比之下，更多依赖化石燃料的行业则不具备这一优势，因 此， PPI 行业的脱碳化工作需特别考虑其独特性。当前， PPI 面临的挑战不 仅在于如何替代化石燃料的使用，更在于提升生物燃料自身使用的可持 续性--这要求确保生物质资源的获取过程尽量减少土地利用变化和对生 物多样性的负面影响，并通过提高能源效率，实现对这些资源的最优利 用。

## 1.2. Pulp and paper industry production &amp; CO2 emission status

全球工业在 1961 年至 2019 年间共产生了 435 亿吨二氧化碳当量的温室 气体排放，约占人类活动导致的全球温室气体排放总量的 4.2%[27] 。其中 ，制浆造纸工业是第四大工业能源用户，其温室气体排放量占全球排放 总量的 1.3% 。

![Image](/api/images/img_1785487540829_9.png)

![Image](/api/images/img_1785487540829_10.png)

图 1. 各部门工业 CO 排放量及终端能源消费占比。

Fig. 2. Illustration of virgin and recycled paper mill processes: from raw materials to final drying.

![Image](/api/images/img_1785487540829_11.png)

Fig. 3. Simplified paper industry process flow, illustrating major production stages and their relative energy consumption shares.

![Image](/api/images/img_1785487540829_12.png)

(nearly 2 % of industrial emissions across its lifecycle) [28]. The global consumption of paper products, including printing paper, writing paper, packaging, and tissue paper reached 417 million tons in 2021 [29]. The manufacturing processes are energy-intensive and require huge amounts of  energy,  including  electricity,  gas,  and  steam  [29].  The  global  PPI consumed a total of around 1361 PJ of energy in 2021 [30]. Steam production in PPI is carried out by utilizing fossil fuels and biofuels, and the electricity requirement is met through purchase from the grid and on-site generation using biofuels (wood residues and black liquor). The study  by  Griffin  et  al.  [31]  identified  that  GHG  emissions  of  PPI accounted for 6 % of UK industrial sector emissions. The PPI is globally distributed, but production is dominated by a few countries, as shown in Fig. 4. Canada is one of the top global pulp and paper producer countries,  and  its  PPI  ranks  2nd  in  energy  consumption  and  7th  in  GHG emissions, excluding the oil and gas sectors [32]. The PPI of China ranks 1st in production in the world, representing around 25 % of worldwide output [33] and ranks among the top 10 for GHG emissions in its industrial sector [13].

Despite the impact of digitalization and the declining use of paper for communication  and  publishing,  overall  production  has  continued  to rise, driven largely by growth in packaging and tissue products. Fig. 5 shows the global pulp production for the paper industry from 1961 to 2023.

Both  direct  and  indirect  emissions  are  generated  by  PPI.  Direct

图 3. 简化图

![Image](/api/images/img_1785487540829_13.png)

行业工艺流程，展示了主要生产阶段及其相对关系

（在其生命周期内，约占工业排放量的近 2% ） [28] 。 2021 年，全球纸制 品消费量（包括印刷纸、书写纸、包装纸及卫生纸等）达到 4.17 亿吨 [29] 。这些产品的生产过程能耗高，需消耗大量能源，涵盖电力、燃气和蒸 汽等 [29] 。 2021 年，全球造纸与纸板工业（ PPI ）共消耗约 1361 拍焦耳的 能源 [30] 。其中，造纸厂的蒸汽生产主要依赖化石燃料和生物燃料；而电 力需求则通过从电网购电以及利用生物燃料（如木材残余物和黑液）进 行现场发电来满足。 Griffin 等人 [31] 的研究指出，英国造纸与纸板工业的 温室气体排放量占该国工业部门总排放量的 6% 。尽管造纸与纸板工业在 全球范围内广泛分布，但其生产却主要集中在少数几个国家，具体情况 如下：

能源消费占比。

图 4 。加拿大是全球领先的纸浆和造纸生产国之一，其 PPI 在能源消耗方 面位居第二，在温室气体排放方面位居第七，但不包括石油和天然气行 业 [32] 。中国 PPI 的产量居世界首位，约占全球总产量的 25%[33] ，并在其 工业部门的温室气体排放量中位列前十 [13] 。

尽管数字化浪潮及纸张在通信和出版领域中的使用量不断下降，但总 体产量却持续增长，这主要得益于包装和纸巾产品的强劲增长。图 5 展示 了 1961 年至 2023 年全球造纸行业纸浆的生产情况。

PPI 会产生直接排放和间接排放。

Table 1 Specific  electricity  and  heat  consumption  of  papermaking  processes,  sources [19 -24].

| Process              | Specific Electricity Consumption kWh/ton   | Specific Heat Consumption GJ/ton   |
|----------------------|--------------------------------------------|------------------------------------|
| Chemical Pulping     | 600 - 800                                  | 4.4 - 7.0                          |
| Mechanical Pulping   | 1500 - 2000                                | 0 - 1.0                            |
| Repulping            | 50 - 100                                   | 0.2 - 0.5                          |
| Screening & Cleaning | 100 - 200                                  | Negligible                         |
| Refining             | 150 - 300                                  | Negligible                         |
| Deinking             | 100 - 200                                  | 0 - 0.2                            |
| Pressing             | 20 - 50                                    | Negligible                         |
| Pre-Drying           | 50 - 100                                   | 6.0 - 8.0                          |
| Post-Drying          | 50 - 100                                   | 7.0 - 9.0                          |
| Calendering          | 10 - 30                                    | Negligible                         |

emissions primarily come from fuel and biomass combustion inside the PPI (in boilers, kilns). Indirect emissions are caused by purchased grid electricity  generated through the combustion of fossil fuel resources, upstream production of raw materials (emissions from forest operations, chemicals  manufacturing,  etc.),  and  downstream  disposal  of  paper products.  Studies  have  shown  that  off-site  generation  of  steam  and electricity for pulp/paper mills historically contributed heavily to the sector '' s GHG profile [36]. A cradle-to-grave view reveals impacts at raw material  and  end-of-life  stages:  wood  harvesting  and  pulpwood  production entail fuel use and sometimes forest carbon stock changes, and paper  disposal  in  landfills  can  produce  methane  [37].  According  to Ref. [38], pulp and paper mills in the US emit 150 MtCO2 each year, of which  77  %  are  biogenic  (biomass-based).  The  PPI  of  India  emitted around 30.5 MtCO2 in 2019 with an average emission intensity of 1.58 tCO2e per ton of paper [39]. The CO2  emissions of the Chinese papermaking industry in 2020 were 111.98 MtCO2 [40], and Germany '' s PPI stood at 13.2 MtCO2 emissions in 2021, and contributes about 2.5 % of total energy-related GHG emissions [41]. Japan '' s PPI was responsible for  approximately  5.5  %  of  the  nation '' s  industrial  CO2  emissions  at approximately 21 MtCO2  in 2019 [42]. For CEPI countries, the direct CO2 emissions in 2022 were 27.03 MtCO2 [43]. Sweden emits 21 MtCO2 annually from its paper industry, with 97 % of biogenic origin. Finland '' s paper sector accounts for 23 -24 % of total energy demand and previously consumed over 25 % of total electricity. The UK emits 2.4 MtCO2 yearly from fossil fuels and 0.9 MtCO2 from electricity consumption in its paper industry. The Netherlands emits 1.054 MtCO2  per year from

Fig. 4. Pulp and paper production per country. Source [34].

![Image](/api/images/img_1785487540829_14.png)

Fig. 5. Global pulp production from 1961 to 2023 (in million metric tons). Data source: Statista [35].

![Image](/api/images/img_1785487540829_15.png)

表 1 纸张生产过程的特定电能与热能消耗，来源 [19 -24] 。

| Process              | Specific Electricity Consumption kWh/ton   | Specific Heat Consumption GJ/ton   |
|----------------------|--------------------------------------------|------------------------------------|
| Chemical Pulping     | 600 - 800                                  | 4.4 - 7.0                          |
| Mechanical Pulping   | 1500 - 2000                                | 0 - 1.0                            |
| Repulping            | 50 - 100                                   | 0.2 - 0.5                          |
| Screening & Cleaning | 100 - 200                                  | Negligible                         |
| Refining             | 150 - 300                                  | Negligible                         |
| Deinking             | 100 - 200                                  | 0 - 0.2                            |
| Pressing             | 20 - 50                                    | Negligible                         |
| Pre-Drying           | 50 - 100                                   | 6.0 - 8.0                          |
| Post-Drying          | 50 - 100                                   | 7.0 - 9.0                          |
| Calendering          | 10 - 30                                    | Negligible                         |

排放主要来自 PPI 内部的燃料和生物质燃烧（如锅炉、窑炉）。间接排放 则源于通过化石燃料资源燃烧所生产的外购电网电力，以及上游原材料 的生产过程（例如森林作业、化学品制造等），还有下游纸张的处置环 节。

科学论文 研究表明，长期以来，为纸浆和造纸厂异地生产蒸汽和电力， 对该行业的温室气体排放状况造成了重大影响 [36] 。从''摇篮到坟墓''的 全生命周期视角来看，原材料阶段和产品生命周期末端均存在环境影响 ：木材采伐和制浆木材的生产过程需消耗燃料，有时还会导致森林碳储 量的变化；而废纸若被填埋处理，则可能产生甲烷 [37] 。据参考文献 [38] 统计，美国的纸浆与造纸厂每年排放 1.5 亿吨二氧化碳当量，其中 77% 为 生物源（基于生物质）。 2019 年，印度造纸工业的直接排放量约为 3050 万吨二氧化碳当量，平均排放强度为每吨纸 1.58 吨二氧化碳当量 [39] 。 20 20 年，中国造纸行业的二氧化碳排放量达到 1.1198 亿吨 [40] ； 2021 年，德 国造纸工业的二氧化碳排放量为 1320 万吨，约占其能源相关温室气体总 排放量的 2.5%[41] 。 2019 年，日本造纸工业的二氧化碳排放量约占全国工 业排放总量的 5.5% ，约为 2100 万吨 [42] 。在欧洲纸业协会（ CEPI ）成员 国中， 2022 年的直接二氧化碳排放量为 2703 万吨 [43] 。瑞典纸业每年排放 2100 万吨二氧化碳，其中 97% 来自生物源；芬兰的造纸行业能源需求占全 国总需求的 23% 至 24% ，历史上曾消耗全国电力总量的 25% 以上。英国纸 业每年因化石燃料燃烧排放 240 万吨二氧化碳，另有 90 万吨来自电力消费 [ 41] 。荷兰则每年排放 105.4 万吨二氧化碳，主要源自其造纸行业 [43] 。

图 4 ：各国纸浆与造纸产量。来源 [34] 。

![Image](/api/images/img_1785487540829_16.png)

图 5 ： 1961 年至 2023 年全球纸浆产量（单位：百万吨）。数据来源： Statista [35] 。

![Image](/api/images/img_1785487540829_17.png)

paper and board products, with additional emissions from specific mill operations. Austria '' s  paper sector accounts for 7 % of industrial CO2 emissions [26]. These figures highlight the CO2 emissions of the paper industry across different countries, underscoring the need for continued efforts in sustainability and emission reduction.

The  subsequent  sections  of  this  paper  are  organized  as  follows: Section 1.3 shows the methodology flowchart followed in this review. Section 2 provides a comprehensive review of the literature on energy consumption, high-emission processes such as black liquor evaporation, chemical pulping, and drying, and explores potential decarbonization pathways for the PPI. Section 3 discusses drivers and barriers to the identified decarbonization pathways, including energy efficiency measures, fuel switching, paper recycling, electrification, and carbon capture.  Section  4 evaluates  the  pathways,  their  mapping  with  the  PPI processes, and their economic feasibility. Section 5 outlines the methodology  for  ranking  decarbonization  pathways  using  the  Analytical Hierarchy  Process  (AHP),  evaluating  them  based  on  cost,  emission reduction potential, technological readiness level, implementation time, and scalability.  Section  6 prioritizes  decarbonization technologies  by ranking them based on AHP results. Section 7 concludes the work with recommendations.

## 1.3. Methodology flowchart

The methodology flowchart is shown in Fig. 6. Firstly, a comprehensive literature review is carried out to identify relevant decarbonization pathways for PPI. Next, the drivers and barriers for each pathway are analyzed to understand their feasibility and challenges. Thirdly, the Analytic Hierarchy Process (AHP) is used to rank these pathways based on five distinct criteria,  including  cost,  emission  reduction  potential, technology readiness level (TRL), implementation time, and scalability. Finally, the pathways are ranked under four distinct criteria weight regimes to provide a nuanced understanding of their performance under varying priorities.

## 2. Literature review

Multiple studies have investigated strategies to reduce the PPI '' s energy use and carbon footprint, reflecting growing interest in sustainable industrial practices. A techno-economic analysis by Obrist et al. [44] for the Swiss PPI showed that by 2050, a 23 % reduction in energy consumption and a 71 % reduction in CO2 emission will result through using cost-effective technological options with no major policy change. The options include switching fuel to biomass, improvements in manufacturing  processes,  application  of  efficient  technologies,  and using high-temperature heat pumps. Energy efficiency and fuel saving translate into lower sector emissions since a major part of emissions is related to fossil fuel burning to cater to process heat and electricity requirements in the PPI. A study by Giuntini et al. [45] to assess the input of syngas derived from biomass, instead of fossil fuels, in the combustion chamber in a tissue paper mill drying section resulted in a reduction of CO2 emission of around 8500 tons/yr compared to the use of fossil fuels. A study of the application of a set of EEMs to the PPI sector of Canada, carried out by Owttrim et al. [46], estimated that the adoption of energy efficiency measures by Canadian PPI would result in a 95 % reduction in natural gas (approximately 71 PJ) use and 41 % reduction in electricity (44 PJ) consumption annually. This translates into a cost reduction of $81  per  ton  of  product.  The  study  of  energy  consumption  through decomposition analysis of the PPI of Brazil for a period of 30 years, carried out by Fracaro et al. [47], demonstrated an annual reduction of 7.8 PJ in electricity consumption and 146.2 PJ of fuel savings compared to the PPI of other countries by the implementation of EEMs. Griffin et al. [48] evaluated energy saving potential and GHG emission reduction  extent  in  the  UK  PPI  through  a  set  of  low-carbon  technological options. The study showed a possible reduction of emissions by 80 % in the period from 1990 to 2050. The reductions depend on technologies including  heat  recovery,  energy  efficiency  improvement,  use  of  bioenergy, electrification of heat supply, and use of carbon-neutral electricity supply.

Fig. 6. Methodology flowchart.

![Image](/api/images/img_1785487540829_18.png)

The potential of energy efficiency to decarbonize the PPI sector was assessed by Owttrim et al. [49] which demonstrated that a 4.92 MtCO2 e/yr reduction in emissions is possible through energy efficiency in the business-as-usual scenario (BAU) by 2050. The sector competitiveness can be improved by adopting full-scale EEMs with an approximate cost of $162/tCO2e. Mobarakeh et al. [50] carried out a case study for PPI of Austria  to  analyze  energy  consumption  and  GHG  emissions  in  the manufacturing processes of pulp and paper, and investigated options for energy  saving  and  emission  reductions.  The  study  showed  that  the electrification of steam supply (electric boiler and heat pumps instead of fossil fuel combustion) can result in emissions reduction by 75 %, and carbon-neutral electricity is the key to the complete decarbonization of Austrian PPI. A report prepared by the Joint Research Center in 2018 [36] forecasted an increase of 1.1 % in energy usage in the PPI sector of the EU and a hike in emissions of up to 4.8 % in 2050 in comparison to 2015, in the case of no technological upgrade. The report analyzed that the utilization of the best available technologies (BATs) can result in energy savings of 14.4 % and CO2 emission abatement of 62.2 % in the EU.

Recycling  waste  paper  is  considered  one  of  the  key  options  that significantly reduces the carbon footprint of the paper industry [13]. Manufacturing  paper  from  recycled  sources  requires  less  energy compared to the virgin pulp production, leading to lower CO2 emissions [51]. Studies show that improving recovered-fiber sorting and recycling can reduce paper sector emissions by up to 30 % [52]. Chang et al. [53] applied  the  LCA  approach  to  evaluate  the  environmental  impacts  of replacing virgin pulp with recycled pulp in the U.S. PPI. The results revealed that using recycled pulp can lead to a significant GHG emissions reduction, with the magnitude of benefits depending on the grades and origin of recycled paper used. Project Drawdown [54] estimates that increasing recycled paper rates by 20 % compared to current rates of 55 % can avoid around 2.3 -2.9 gigatons of CO2 emissions over the next 30 years. Also, paper recycling is a commercially proven solution that can be scaled relatively easily.

The abatement in CO2 emissions is also largely attributed to the use of biofuels and improving the efficiency of processes such as heat recovery. The CEPI, through the report named '' Two Team Project '' [55] aims  at  cutting  CO2  emissions  by  80  %  compared  to  1990  through improving efficiency, switching fuel to low-carbon sources, and other

纸和纸板产品，以及特定造纸厂运营带来的额外排放。奥地利的造纸行 业占工业二氧化碳排放量的 7%[26] 。这些数据突显了各国造纸行业的二 氧化碳排放情况，进一步强调了持续推动可持续发展和减少排放工作的 必要性。

本文的后续章节安排如下：第 1.3 节展示了本综述所采用的方法流程图 。第 2 节全面回顾了有关能源消耗及黑液蒸发、化学制浆和干燥等高排放 工艺的文献，并探讨了推动 PPI 行业实现碳减排的潜在路径。第 3 节分析 了已识别碳减排路径的驱动因素与障碍，包括提高能效措施、燃料转换 、造纸回收利用、电气化以及碳捕集技术。第 4 节评估了这些路径，将其 与 PPI 工艺进行映射，并分析其经济可行性。第 5 节介绍了基于层次分析 法（ AHP ）对碳减排路径进行排序的方法学，从成本、减排潜力、技术 成熟度、实施周期及可扩展性等多个维度对其进行综合评价。第 6 节根据 AHP 的评估结果，对各项碳减排技术进行了优先级排序。第 7 节总结了研 究工作，并提出了相关建议。

## 1.3. Methodology flowchart

方法流程图如图 6 所示。首先，通过全面的文献综述，确定适用于 PPI 的相关脱碳路径。接着，分析每条路径的驱动因素与障碍，以深入了解 其可行性和面临的挑战。然后，运用层次分析法（ AHP ），根据成本、 减排潜力、技术成熟度（ TRL ）、实施时间和可扩展性这五个不同标准， 对这些路径进行排序。最后，在四种不同的标准权重方案下对路径进行 排名，以便更细致地了解它们在不同优先级下的表现。

## 2. 文献综述

多项研究已探讨了降低 PPI 能源使用和碳足迹的策略，这反映了人们 对可持续工业实践日益增长的兴趣。 Obrist 等人 [44] 对瑞士 PPI 进行的一项 技术经济分析表明，到 2050 年，通过采用相关措施，能源消耗将减少 23% ，二氧化碳排放量将大幅下降 71% 。

图 6. 方法流程图。

![Image](/api/images/img_1785487540829_19.png)

具有成本效益且无需重大政策调整的技术选项。这些选项包括：将燃料 切换为生物质、改进制造工艺、应用高效技术，以及使用高温热泵。由 于 PPI 行业大部分排放源自化石燃料燃烧，用于满足工艺供热和电力需求 ，因此提高能效与节约燃料将直接带来该行业的减排效果。 Giuntini 等人 [45] 的一项研究评估了在纸巾厂干燥工段的燃烧室内，以生物质合成气替 代化石燃料的效果，结果表明，与使用化石燃料相比，每年可减少约 850 0 吨的 CO 排放。此外， Owttrim 等人 [46] 针对加拿大 PPI 行业实施的一系 列能源效率措施的研究估计，若全面推广这些措施，加拿大 PPI 行业每年 将实现天然气使用量减少 95% （约 71 PJ ），电力消耗降低 41% （ 44 PJ ） 。这不仅有助于降低生产成本，每吨产品还能节省 81 美元。与此同时， Fr acaro 等人 [47] 对巴西 PPI 行业过去 30 年的能源消耗进行了分解分析，结果 显示，通过实施一系列能效措施，该行业每年可减少 7.8 PJ 的电力消耗， 并实现 146.2 PJ 的燃料节约，显著优于其他国家的 PPI 表现。 Griffin 等人 [4 8] 则评估了英国 PPI 行业在低碳技术选项支持下的节能潜力及温室气体减 排幅度，研究表明，从 1990 年到 2050 年，该行业有望实现高达 80% 的排放 削减。这些减排成果主要依赖于多项技术手段，如余热回收、能效提升 、生物能源利用、供热电气化，以及碳中和电力供应的全面推广。

奥特里姆等人 [49] 评估了能源效率在实现制浆造纸工业部门脱碳方面 的潜力，研究表明，在 2050 年''一切如常''（ BAU ）的情景下，通过提 高能效，每年可减少 492 万吨二氧化碳当量排放。此外，若全面采用先进 的能效管理措施，该行业的竞争力有望提升，相关成本约为每吨二氧化 碳当量 162 美元。莫巴拉克等人 [50] 以奥地利制浆造纸工业为案例，深入 分析了纸浆和造纸生产过程中的能源消耗与温室气体排放情况，并探讨 了节能及减排的可行方案。研究发现，将蒸汽供应方式电气化（如用电 锅炉和热泵替代化石燃料燃烧），可使排放量大幅削减 75% ；而实现完全 脱碳的关键，则在于使用碳中和电力。此外，欧盟联合研究中心于 2018 年发布的一份报告 [36] 预测，若不进行技术升级，到 2050 年欧盟制浆造纸 工业的能源使用量将增长 1.1% ，排放量甚至可能比 2015 年增加高达 4.8% 。然而，报告同时指出，若广泛采用最佳可用技术（ BATs ），则有望实 现 14.4% 的能源节约，并将二氧化碳排放量削减 62.2% 。

回收废纸被认为是显著降低造纸行业碳足迹的关键选项之一 [13] 。与 生产原生纸浆相比，利用再生资源制造纸张所需能源更少，从而有效减 少二氧化碳排放 [51] 。研究表明，通过改进废纸纤维的分拣与回收工艺， 纸业领域的排放量最多可降低 30%[52] 。 Chang 等人 [53] 采用生命周期评估 （ LCA ）方法，对美国包装纸行业中用再生浆替代原生浆所带来的环境 影响进行了评估。结果表明，使用再生浆能够大幅减少温室气体排放， 而具体减排效果则取决于所用再生纸的等级及其来源。此外， Project Dra wdown[54] 估算，若将废纸回收率从目前的 55% 提升至 75% ，未来 30 年内 可避免约 2.3 至 2.9 亿吨的二氧化碳排放。同时，纸张回收作为一种经过市 场验证的解决方案，具备易于大规模推广的潜力。

CO 2 排放的减少也主要归因于生物燃料的使用，以及热能回收等工艺 效率的提升。 CEPI 通过名为''双团队项目''的报告 [55] ，旨在通过提高效 率、改用低碳燃料来源等方式，将 CO 2 排放量较 1990 年水平削减 80% 。

innovative  measures  such  as  deep  eutectic  solvents  technology,  and electrification of heat supply. The study by Lipi ¨ ainen et al. [56] revealed that the PPI of Finland and Sweden has reduced its energy consumption per output through improved efficiency. The CO2  emissions of PPI of both countries also decreased significantly, and green electricity production  increased  due  to  the  shift  towards  low-carbon  biofuels.  By decreasing the use of oil, the CO2 emissions of the PPI of Sweden were reduced by 80 % between 1973 and 1990, while the production surged by  18  %  [57].  The  examples  of  Finland  and  Sweden  illustrate  that decarbonization of the PPI is possible through an increased share of renewable energy sources in the fuel mix.

A techno-economic analysis by Mati et al. [58] explored using onsite hydrogen as fuel in a paper mill '' s cogeneration system. By modeling a multi-energy system with hydrogen produced via solar-powered PEM electrolyzers, the optimized solution reduced annual CO2  emissions by 29,273 tons. A review of decarbonization pathways, along with their technological maturity, by Gailani et al. [59] identifies key pathways such  as  replacing  fossil  fuels  with  biomass  and  hydrogen,  and  CCS, having the potential to reduce emissions of industrial sectors by 85 %.

From  the  literature  reviewed  above,  five  primary  pathways  for decarbonizing  the  PPI  are  identified,  which  include:  (1)  energy  efficiency measures (EEMs) and/or improved processes, (2) electrification of heat supply, (3) paper recycling, (4) switching to carbon-neutral fuels such  as  biomass  and  hydrogen  to  replace  fossil  fuels,  and  (5)  CCS technologies, as summarized in Table 2.

Fig.  7 illustrates  the  potential  of  CO2  abatement  and  TRL  of  the identified decarbonization pathways, which are thoroughly reviewed in section 3 to assess their potential drivers and barriers in implementation.

Table 2 highlights various decarbonization pathways that can help reduce GHG emissions in the PPI. EEMs such as waste heat recovery, energy management systems, equipment inefficiency checks, bioenergy retrofits, and cogeneration have the potential to save a lot of energy and reduce emissions significantly. However, the adoption of EEMs is often hindered by low returns, capital constraints, and policy uncertainties. Similarly,  paper  recycling  can  reduce  energy  consumption  and  cut emissions  if  the  recycling  processes  use  renewable  energy  sources. Decarbonization pathways such as steam supply electrification, switching to carbon-neutral fuels such as biomass, utilizing hydrogen in combined heat and power systems, and implementing CCS technologies can  also  help  mitigate  and  even  completely  cut  the  CO2  emissions. However, these pathways face barriers such as high capital costs for substantial equipment redesigns, lack of literature available regarding the overall effects of retrofits on the paper-making process, and a lack of incentives for negative emissions technologies. Hence,  successful implementation with sustainable planning, investment, and collaboration among stakeholders is necessary to realize the full potential of these measures and pathways.

## 3. Drivers and barriers to the decarbonization pathways

After  identifying the  key  decarbonization pathways, their specific drivers  and  barriers  are  discussed  in  the  following  sub-sections.  Understanding these drivers and barriers is crucial for assessing real-world feasibility beyond just technical potential.

## 3.1. Energy efficiency as a decarbonization measure for PPI

EEMs are universally regarded as the first step in industrial decarbonization. EEMs span a wide range of actions in PPI, which include equipment upgrades, heat integration, waste heat recovery, reducing steam leaks, insulating pipes, optimizing process controls, and implementing  energy  management  systems.  The  availability  and  costeffectiveness  of  energy-efficient  technologies,  along  with  their  adoption, can address several issues such as reducing the costs of production, increasing a company '' s competitiveness, ensuring energy security, and decreasing  pollution  levels.  Numerous  case  studies  have  shown  that abatement potential.

Table 2 Summary of decarbonization pathways in PPI along with their TRL and CO2

| Decarbonization Pathway           | Measure                                                                                                  | Process                            | CO 2 abatement potential                                            | TRL         |
|-----------------------------------|----------------------------------------------------------------------------------------------------------|------------------------------------|---------------------------------------------------------------------|-------------|
| Energy Efficiency Measures (EEMs) | Recovery and reuse of waste heat                                                                         | Pulp/paper drying                  | Up to 9 % [60]                                                      | 9           |
|                                   | Energy management                                                                                        | Mill-wide monitoring               | Up to 15 %[61]                                                      | 9           |
|                                   | systems Equipment maintenance &                                                                          | Motors, pumps, heat exchangers     | Up to 10 %[46]                                                      | 9           |
|                                   | optimization Biological pre- treatment                                                                   | Mechanical pulping                 | Up to 15 %[60]                                                      | 8 - 9       |
|                                   | (enzymatic) Membrane concentration of                                                                    | Chemical recovery                  | Up to 36 % (evaporation) [44]                                       | 6 - 7       |
|                                   | black liquor Closed-hood                                                                                 | Paper drying                       | 13 - 45 % [62]                                                      | 9           |
|                                   | paper machine Forming-steam box                                                                          | Sheet forming                      | Up to 5 % [26]                                                      | 9           |
|                                   | Hot pressing                                                                                             | Pressing section                   | Up to 8 % [63]                                                      | 7 - 8       |
|                                   | Condebelt drying                                                                                         | Paper drying                       | Up to 15 %[50]                                                      | 7 - 8       |
|                                   | Mechanical vapor recompression (MVR)                                                                     | Paper drying                       | Up to 50 % (thermal) [64]                                           | 8 - 9       |
|                                   | Functional surface (light- weighting)                                                                    | Paper making                       | Up to 8 % [56]                                                      | 8 - 9       |
| Steam supply                      | New fibrous fillers                                                                                      | Paper making                       | Up to 20 %[56]                                                      | 5 - 6       |
| Electrification.                  | Using electric boilers or heat pumps instead of fossil fuel boilers to generate heat                     | Steam generation                   | Up to 100 %(for processes if powered by renewable electricity) [50] | 6 - 7       |
| Paper Recycling                   | Reuse of post- consumer paper as pulp feedstock, thereby reducing the requirement                        | Pulp production                    | Up to 25 %[51]                                                      | 9           |
| Switching to carbon-neutral fuels | for virgin pulp. Replacing fossil fuels in the boiler with on-site produced biomass (waste wood, sludge, | Steam boilers                      | Up to 40 %[64]                                                      | 9           |
|                                   | and black liquor) Replacing fossil fuels with Hydrogen                                                   | Boilers/CHP                        | Up to 100 % of combustion emissions (if green hydrogen              | 7 - 8       |
|                                   | Biomass-fired CHP (onsite)                                                                               | Power & steam generation           | is used) [58] Up to 20 %[65]                                        | 9           |
| Carbon Capture and Storage (CCS)  | BECCS (biomass energy + CCS)                                                                             | Flue-gas capture (recovery boiler) | Up to 60 %[66]                                                      | 7 - 8       |
|                                   | Calcium Looping Electric Plasma                                                                          | Flue-gas capture Flue-gas          | Up to 60 %[67] Up to 60 %[68]                                       | 7 - 8 7 - 8 |

energy audits and efficiency measures can cost-effectively reduce energy use and emissions, for example, reducing thermal energy consumption by 20 % through heat recovery measures [69]. Stenqvist, C [70]. conducted a study on Swedish PPI energy use and performance between 1984 and 2011, revealing that energy efficiency improvements resulted

创新性措施，如深共晶溶剂技术以及供热电气化。 Lipi ¨ ainen 等人 [56] 的研 究表明，芬兰和瑞典的制浆造纸工业通过提高能效，实现了单位产出能 耗的降低。两国制浆造纸工业的二氧化碳排放量也显著下降，同时由于 转向低碳生物燃料，绿色电力生产大幅增加。此外，通过减少石油使用 ，瑞典制浆造纸工业的二氧化碳排放量在 1973 年至 1990 年间降低了 80% ， 而同期产量却激增了 18%[57] 。芬兰和瑞典的案例充分说明，通过提升可 再生能源在燃料结构中的占比，实现制浆造纸工业的脱碳化是完全可行 的。

马蒂等人 [58] 开展了一项技术经济分析，探讨了在造纸厂的热电联产 系统中使用现场制氢作为燃料的可行性。通过构建一个以太阳能驱动质 子交换膜（ PEM ）电解槽制氢的多能互补系统模型，优化后的方案每年 可减少二氧化碳排放 29,273 吨。此外，盖拉尼等人 [59] 对脱碳路径及其技 术成熟度进行了综述，指出诸如用生物质和氢能替代化石燃料，以及碳 捕集与封存（ CCS ）等关键路径，有望使工业部门的碳排放量大幅削减 85 % 。

根据上述文献综述，本文 identified 了实现 PPI 脱碳的五条主要途径， 包括：（ 1 ）提高能源效率措施和 / 或优化生产工艺；（ 2 ）实现供热电气 化；（ 3 ）推动造纸行业回收利用；（ 4 ）改用生物质能和氢能等碳中性 燃料替代化石燃料；以及（ 5 ）采用 CCS 技术。具体总结见表 2 。

图 7 展示了 CO 2 减排的潜力，以及所识别的脱碳路径的技术成熟度等 级（ TRL ），这些路径在第 3 节中得到了全面回顾，以评估其在实施过程 中可能面临的驱动因素和障碍。

表 2 重点介绍了多种脱碳路径，这些路径有助于降低 PPI 领域的温室气 体排放。诸如余热回收、能源管理系统、设备能效检查、生物能源改造 以及热电联产等节能与减排技术，有望大幅节省能源并显著减少排放。 然而，这些节能与减排技术的推广往往受到回报率低、资金限制以及政 策不确定性等因素的制约。同样，若造纸回收过程采用可再生能源，便 能有效降低能耗、减少排放。此外，通过蒸汽供应电气化、改用生物质 等碳中性燃料、在热电联产系统中利用氢能，以及实施碳捕集与封存（ C CS ）技术等脱碳路径，也能帮助缓解甚至彻底消除 CO 排放。不过，这 些路径同样面临诸多障碍，例如大规模设备改造所需的高昂资本投入、 现有文献对改造措施如何全面影响造纸工艺缺乏深入研究，以及针对负 排放技术的激励机制不足。因此，唯有借助可持续的规划、充足的投资

- ，真正实现预期目标。
- ，并加强利益相关方之间的协作，才能充分发挥这些措施与路径的潜力

## 3. 脱碳路径的驱动因素与障碍

在确定关键的脱碳路径后，其具体驱动因素和障碍将在以下各小节中 进行讨论。理解这些驱动因素和障碍，对于评估实际可行性至关重要， 而不仅仅是技术潜力。

## 3.1. Energy efficiency as a decarbonization measure for PPI

EEMs 被普遍视为工业脱碳的第一步。在 PPI 中， EEMs 涵盖了广泛的 行动措施，包括设备升级、热能整合、余热回收、减少蒸汽泄漏、管道 保温、优化过程控制以及实施能源管理系统。这些节能技术的可获得性 和成本效益，加上其推广应用，能够有效解决诸多问题，例如降低生产 成本、提升企业竞争力、保障能源安全，并减少污染排放水平。多项案 例研究表明，

表 2 PPI 中脱碳路径的总结，以及它们的技术成熟度等级和 CO 减排潜力。

| Decarbonization Pathway           | Measure                                                                                                              | Process                            | CO 2 abatement potential                                            | TRL         |
|-----------------------------------|----------------------------------------------------------------------------------------------------------------------|------------------------------------|---------------------------------------------------------------------|-------------|
| Energy Efficiency Measures (EEMs) | Recovery and reuse of waste heat                                                                                     | Pulp/paper drying                  | Up to 9 % [60]                                                      | 9           |
|                                   | Energy management                                                                                                    | Mill-wide monitoring               | Up to 15 %[61]                                                      | 9           |
|                                   | systems Equipment maintenance &                                                                                      | Motors, pumps, heat                | Up to 10 %[46]                                                      | 9           |
|                                   | optimization Biological pre- treatment                                                                               | exchangers Mechanical pulping      | Up to 15 %[60]                                                      | 8 - 9       |
|                                   | (enzymatic) Membrane concentration of                                                                                | Chemical recovery                  | Up to 36 % (evaporation) [44]                                       | 6 - 7       |
|                                   | black liquor Closed-hood                                                                                             | Paper drying                       | 13 - 45 % [62]                                                      | 9           |
|                                   | paper machine Forming-steam box                                                                                      | Sheet forming                      | Up to 5 % [26]                                                      | 9           |
|                                   | Hot pressing                                                                                                         | Pressing section                   | Up to 8 % [63]                                                      | 7 - 8       |
|                                   | Condebelt drying                                                                                                     | Paper drying                       | Up to 15 %[50]                                                      | 7 - 8       |
|                                   | Mechanical vapor recompression (MVR)                                                                                 | Paper drying                       | Up to 50 % (thermal) [64]                                           | 8 - 9       |
|                          ', 'internal', 3, NULL, '2026-07-31T08:45:40.898Z'::timestamptz, '2026-07-31T08:45:40.898Z'::timestamptz, NULL);

INSERT INTO public.entry_tags (entry_id, tag_id)
SELECT v.entry_id, t.id
FROM (VALUES (326,'造纸'),(326,'翻译文档'),(351,'造纸'),(351,'专利'),(353,'造纸'),(353,'专利'),(354,'造纸'),(354,'专利'),(367,'造纸'),(367,'专利'),(369,'造纸'),(369,'翻译文档')) AS v(entry_id, tag_name)
JOIN public.tags t ON t.name = v.tag_name
ON CONFLICT (entry_id, tag_id) DO NOTHING;

INSERT INTO public.entry_relations
(source_entry_id, target_entry_id, relation_type, similarity, relation_source, created_at, updated_at)
SELECT v.source, v.target, 'semantic_related', v.sim, 'embedding', v.created, v.updated
FROM (VALUES (326, 369, 0.7565444715658027, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(354, 369, 0.690986354949215, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(353, 369, 0.6549416147477505, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(351, 369, 0.6947148907003884, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(367, 369, 0.64693011016362, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(326, 367, 0.6914226480906112, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(353, 367, 0.7775745464867605, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(354, 367, 0.8267540145496868, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(351, 367, 0.836910546110126, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(326, 354, 0.7385607506438925, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(353, 354, 0.5571703333822406, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(351, 354, 0.5827209159357671, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(326, 353, 0.6804766055658642, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(351, 353, 0.5872306765324071, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(326, 351, 0.7020777271817515, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 326, 0.7115330653761138, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 369, 0.7096976339933132, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 354, 0.6129733836034645, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 367, 0.6100337746349087, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 353, 0.6033617009217429, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z'),(1, 351, 0.5880801641280633, '2026-08-12T03:35:02.638Z', '2026-08-12T03:35:02.638Z')) AS v(source, target, sim, created, updated)
ON CONFLICT (source_entry_id, target_entry_id, relation_type) DO NOTHING;

COMMIT;
