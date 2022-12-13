import { TbodyComponent } from './tbody/tbody.component';
import { Component, OnInit, ViewChild } from '@angular/core';

@Component({
  selector: 'kern-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss']
})
export class TableComponent implements OnInit {
  @ViewChild(TbodyComponent)
  private TbodyComponent!: TbodyComponent;


  constructor()
    {
  }

  ngOnInit(): void {

  }
  deleteRows():void
  {
    this.TbodyComponent.delete();
  }
  duplicateRows(): void{
    this.TbodyComponent.duplicate();
  }

  filterRows($event): void{
    this.TbodyComponent.applyFilter($event);
  }
  trainModels():void{
    this.TbodyComponent.trainModels()
  }
}
