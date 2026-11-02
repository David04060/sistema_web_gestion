import {z} from 'zod';

/** Calendario gregoriano, sin normalizar silenciosamente fechas imposibles. */
export const fechaRegistro=z.string().regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/,'Use año, año-mes o año-mes-día').refine(valor=>{
 const [anio,mes,dia]=valor.split('-').map(Number);
 if(!anio||anio<1||anio>9999)return false;
 if(mes===undefined)return true;
 if(mes<1||mes>12)return false;
 const bisiesto=anio%4===0&&(anio%100!==0||anio%400===0);
 return dia===undefined||dia>=1&&dia<=[31,bisiesto?29:28,31,30,31,30,31,31,30,31,30,31][mes-1]!;
},'Fecha de registro inválida; use un año entre 1 y 9999');

/** PostgreSQL convierte estos límites al huso institucional America/Lima. */
export function periodoRegistro(fecha?:string){
 if(!fecha)return {inicio:null,intervalo:null};
 const partes=fecha.split('-');
 return {inicio:fecha+(partes.length===1?'-01-01':partes.length===2?'-01':''),intervalo:partes.length===1?'1 year':partes.length===2?'1 month':'1 day'};
}
