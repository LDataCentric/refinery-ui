import { Component, OnInit, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'kern-table-options',
  templateUrl: './table-options.component.html',
  styleUrls: ['./table-options.component.scss']
})
export class TableOptionsComponent implements OnInit {
  @Output() deleteEvent = new EventEmitter();
  @Output() duplicateEvent = new EventEmitter();
  @Output() filterEvent = new EventEmitter();
  @Output() trainEvent = new EventEmitter();
  constructor() { }

  ngOnInit(): void {
  }

}
