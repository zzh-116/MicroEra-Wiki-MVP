import { DataItem } from '../types/dataItem';

export const mockDataItems: DataItem[] = [
  {
    id: 1,
    entry_id: 7,
    data_name: 'CrystalStructureMap',
    data_definition: '晶体微观拓扑结构、空间群矢量、自由点位微扰振幅信息对齐表，用于A组CIF解析与B组性质算子预估的传输对准。',
    data_format: 'cif / json',
    storage_description: '存储于集群存储节点 /cluster-s/data/materials/structures_cif/ 目录下，按周周期备份。',
    schema_description: '字段包含: Bravais_matrix (double[3][3]), atom_symbols (string[]), fractional_positions (double[][3]), spin_states (int[]).',
    schema_version: 'v0.1',
    responsible_person: '研发 A 组 - 李工',
    updated_at: '2026-06-10T01:57:11Z'
  },
  {
    id: 2,
    entry_id: 8,
    data_name: 'LabCharacterizationRecord',
    data_definition: '保存物理气相/化学气相沉积测试样片、探针电流电压（I-V）特性及磁导率偏置磁矩测量的原始时序结构。',
    data_format: 'sql / json',
    storage_description: '存储于分布式分析库 PostgreSQL 物理模式 schema_lab 下的 tables: measurement_headers 及 measurement_series。',
    schema_description: '字段包含: sample_id (uuid PRIMARY KEY), device_code (varchar), stimulus_voltages (numeric[]), measured_currents (numeric[]), step_temp_k (float).',
    schema_version: 'v0.2',
    responsible_person: '研发 B 组 - 王工',
    updated_at: '2026-06-10T01:57:11Z'
  }
];
