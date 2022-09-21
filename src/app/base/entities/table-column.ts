export interface Column{
  columnDef: string;
  header: string;
  isSort: boolean;
  isPrimaryKey: boolean;
  classStyle: string;
  columnType: ColumnType;
  dataType: DataType;
  parent?: any;
}

export enum ColumnType{
  DATA_POINT= "DATA_POINT",
  LABELING_TASK= "LABELING_TASK"
}

export enum DataType{
  TEXT= "TEXT",
  CATEGORY= "CATEGORY",
  INTEGER= "INTEGER",
  FLOAT= "FLOAT",
  BOOLEAN= "BOOLEAN",
  UNKNOWN= "UNKNOWN"


}