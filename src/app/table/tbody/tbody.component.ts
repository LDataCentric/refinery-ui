import { MatTableDataSource } from '@angular/material/table';
import generateData from 'src/app/base/temp/fakeData';
import { MatSort } from '@angular/material/sort';
import { DataSource, SelectionModel } from '@angular/cdk/collections';
import { Component, OnInit, ViewChild } from '@angular/core';
import { Column, ColumnType, DataType } from '../../base/entities/table-column';
import { OrganizationApolloService } from 'src/app/base/services/organization/organization-apollo.service';
import { RecordApolloService } from 'src/app/base/services/record/record-apollo.service';
import { ProjectApolloService } from '../../base/services/project/project-apollo.service';
import { first, map } from 'rxjs/operators';
import { Observable, Subscription, forkJoin, pipe} from 'rxjs';
import { RouteService } from 'src/app/base/services/route.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Project } from 'src/app/base/entities/project';
import {moveItemInArray, CdkDragDrop} from '@angular/cdk/drag-drop';
import { DataBrowserComponent } from 'src/app/data/components/data-browser/data-browser.component';
import {InformationSourceType,LabelSource} from 'src/app/base/enum/graphql-enums';

@Component({
  selector: 'kern-tbody',
  templateUrl: './tbody.component.html',
  styleUrls: ['./tbody.component.scss']
})

export class TbodyComponent implements OnInit {
  constructor(    private projectApolloService: ProjectApolloService,
                  private recordApolloService: RecordApolloService,
                  private organizationService: OrganizationApolloService,
                  private router: Router,
                  private routeService: RouteService,
                  private activatedRoute: ActivatedRoute)
                  {
                    this.dataSource = new MatTableDataSource();
                  }
  static DUMMY_SESSION_ID = "00000000-0000-0000-0000-000000000000";
  displayedColumns: string[] = ['checkbox'];
  dataSource: MatTableDataSource<any>;
  selection = new SelectionModel<any>(true, []);
  @ViewChild(MatSort) sort: MatSort = new MatSort();
  total = 100000;
  private buffer = 100; // limit from bottom to trigger

  loggedInUser: any;
  displayUserId: any;
  project$: any;
  project: Project;
  subscriptions$: Subscription[] = [];
  sortOrder = [] ;
  attributesQuery$: any;
  labelingTasksQuery$: any;
  labelingTasks$: any;
  labelingTasksMap = new Map<string, any>();
  labelHotkeys: Map<string, { taskId: string, labelId: string }> = new Map<string, { taskId: string, labelId: string }>();
  showTokenDisabled = true;
  labelingTaskWait: boolean;
  labelingTaskColumns = [];
  predictionsColumns = [];
  columns: Column[];
  sessionData: any;
  session$: any;
  recordList$ = [];
  scrollLock = false;
  recordLabelAssociationsQuery$: any;
  recordLabelAssociations$: any;



  async onTableScroll(e: any): Promise<void> {
    const tableViewHeight = e.target.offsetHeight; // viewport
    const tableScrollHeight = e.target.scrollHeight; // lenght of all table
    const scrollLocation = e.target.scrollTop; // how far was the scroll
    const limit = tableScrollHeight - tableViewHeight - this.buffer;
    if (scrollLocation > limit && this.dataSource.data.length < this.total){
      await this.concatData();
    }
  }

  ngOnInit(): void {
    this.routeService.updateActivatedRoute(this.activatedRoute);
    const projectId = this.activatedRoute.parent.snapshot.paramMap.get("projectId");
    const initialTasks$ = [];
    initialTasks$.push(this.prepareUser());
    initialTasks$.push(this.prepareProject(projectId));
    initialTasks$.push(this.prepareSortOrder(projectId));
    initialTasks$.push(this.getLabelingTasks(projectId));
    forkJoin(initialTasks$).pipe(first()).subscribe(_ => {
      this.requestRecordIds(projectId, TbodyComponent.DUMMY_SESSION_ID).then(() => {
      this.concatData();
      });
      this.columns = this.generateColumns();
      this.displayedColumns.push(...this.columns.map( element => element.columnDef));
      if (this.displayedColumns.length > 7){
        this.displayedColumns = [];
        window.alert("Error, there are too many datapoints to handle");
      }
    });
  }


  async concatData(): Promise<void>{
    let data: any[];
    if (this.dataSource)
     {
        data = [...this.dataSource.data, ...(await this.getDataServer(15, this.project.id))];
     }
     else
     {
      data = await this.getDataServer(15, this.project.id);
     }
    this.dataSource = new MatTableDataSource(data);
    this.scrollLock = false;
    this.dataSource.sort = this.sort;
  }
  async getDataServer(requestNum: number, projectId: string): Promise<Array<any>> {
    if (requestNum < 1 || this.scrollLock){
      return [];
    }
    const recordList = [];
    this.scrollLock = true;
    for ( let i = this.sessionData.currentIndex; i < this.sessionData.currentIndex + requestNum; i++){
      const pipeFirst = this.recordApolloService.getRecordByRecordId(projectId, this.sessionData.recordIds[i]).pipe(first());
      pipeFirst.subscribe(e => recordList.push({...e.data, _id: e.id}));
      this.recordList$.push(pipeFirst);
    }

    await forkJoin(this.recordList$).pipe(first()).toPromise();
    recordList.forEach(async (record) => {
      await this.colletRecordData(projectId, record);
    });
    this.sessionData.currentIndex += requestNum;
    return recordList;
  }

  async colletRecordData(projectId: string, record: any): Promise<void>{
    let rlas$;
    [this.recordLabelAssociationsQuery$, rlas$] =
    this.recordApolloService.getRecordLabelAssociations(projectId, record._id);
    let result = await rlas$.pipe(first()).toPromise();
    result.forEach(element => {
        // console.log(element);
        if (element.confidence && element.sourceType === LabelSource.INFORMATION_SOURCE
          && element.informationSource.type === InformationSourceType.ACTIVE_LEARNING)
        {
          record[element.sourceId] = {confidence: element.confidence, id: element.id, label: element.labelingTaskLabel};
        }
        if ( element.sourceType === LabelSource.MANUAL){
          // console.log(element.labelingTaskLabel.labelingTask.name);
          // rlasId represents only manual record lable associations
          record[element.labelingTaskLabel.labelingTask.name] = {labelId: element.labelingTaskLabelId, rlasId: element.id};
          // console.log(record[element.labelingTaskLabel.labelingTask.name]);
        }
      });
  }

  isAllSelected(): boolean{
    return (this.selection.selected.length === this.dataSource.data.length);
  }

  masterToogle(): void{
    if (this.isAllSelected()){
      this.selection.clear();
    }
    else{
      this.dataSource.data.forEach(row => this.selection.select(row));
    }
  }
  async delete(): Promise<void>{
    const deletedIds: Array<string> = [];
    const oldData = this.dataSource.data;
    try{
      this.selection.selected.forEach(item => {
        const index: number = this.dataSource.data.findIndex(data => data === item);
        // console.log(this.project.id);
        // console.log(this.dataSource.data[index]);
        deletedIds.push(this.dataSource.data[index]._id);
        this.dataSource.data.splice(index, 1);
      });
      // let response =  await this.recordApolloService.deleteByRecordIds(this.project.id, deletedIds).toPromise();
      // console.log(response);
      // if(!(response.data as any).deleteRecords.ok){
      //   throw Error("server side error");
      // }
      // this.selection.clear();
      // this.concatData();
      // this.dataSource._updateChangeSubscription();
      // this.dataSource.sort = this.sort;

    }
    catch (error) {
      window.alert(error.message);
      this.dataSource.data = oldData;
      this.selection.clear();
      this.dataSource._updateChangeSubscription();
      this.dataSource.sort = this.sort;
    }

  }

  duplicate(): void{
    this.selection.selected.forEach(item => {
      const index: number = this.dataSource.data.findIndex(data => data === item);
      this.dataSource.data.splice(index, 0 , {...item});
    });
    this.selection.clear();
    this.dataSource._updateChangeSubscription();
    this.dataSource.sort = this.sort;
  }

  columnDropped(event: CdkDragDrop<string[]>): void {
    if (event){
        moveItemInArray(this.displayedColumns, event.previousIndex + 1 , event.currentIndex + 1);
      }
    }

  // fetcing data functions
  prepareUser(): Observable<any>{
    const pipeFirst = this.organizationService.getUserInfo()
    .pipe(first());

    pipeFirst.subscribe((user) => {
    this.loggedInUser = user;
    this.displayUserId = user.id;
  });
    return pipeFirst;
  }

  prepareProject(projectId: string): Observable<any> {
    this.project$ = this.projectApolloService.getProjectById(projectId);
    this.subscriptions$.push(this.project$.subscribe((project) => {
      this.project = project;
    }));


    return this.project$.pipe(first());
  }

  prepareSortOrder(projectId: string): Observable<any> {
    let vc$;
    [this.attributesQuery$, vc$] = this.projectApolloService.getAttributesByProjectId(projectId);
    const pipeFirst = vc$.pipe(first());

    this.subscriptions$.push(vc$.subscribe((attributes) => {
      attributes.forEach((att) => {
        // console.log(att);
        this.sortOrder.push({ key: att.name, order: att.relativePosition, dataType: att.dataType,
           id: att.id, isPrimaryKey: att.isPrimaryKey});
      });
      this.sortOrder.sort((a, b) => a.order - b.order);
      // this.applyColumnOrder();
    }));
    return pipeFirst;
  }

  prepareLabelingTask(projectID: string): any {
    [this.labelingTasksQuery$, this.labelingTasks$] = this.projectApolloService.getLabelingTasksByProjectId(projectID);
    // console.log("this.labeling tasks");
    // console.log(this.labelingTasks$)
    // this.labelingTasks$.subscribe(e=>console.log(e))
    // this.subscriptions$.push(this.labelingTasks$.subscribe((tasks) => {
    //   tasks.sort((a, b) => this.compareOrderLabelingTasks(a, b)); // ensure same position

    //   this.labelHotkeys.clear();
    //   if (this.onlyLabelsChanged(tasks)) {
    //     tasks.forEach((task) => {
    //       task.labels.sort((a, b) => a.name.localeCompare(b.name));
    //       task.labels.forEach(l => {
    //         if (l.hotkey) this.labelHotkeys.set(l.hotkey, { taskId: task.id, labelId: l.id });
    //       });
    //       this.labelingTasksMap.get(task.id).labels = task.labels;
    //     });
    //     console.log("LabelHotKey")
    //     console.log(this.labelHotkeys)
    //     console.log("LabelingTaskMap")
    //     console.log(this.labelingTasksMap)
    //   } else {
    //     this.labelingTasksMap.clear();
    //     this.showTokenDisabled = true;
    //     tasks.forEach((task) => {
    //       task.labels.sort((a, b) => a.name.localeCompare(b.name));
    //       task.labels.forEach(l => {
    //         if (l.hotkey) this.labelHotkeys.set(l.hotkey, { taskId: task.id, labelId: l.id });
    //       });
    //       this.labelingTasksMap.set(task.id, task);
    //       if (this.showTokenDisabled && task.taskType == LabelingTask.INFORMATION_EXTRACTION) this.showTokenDisabled = false;
    //     });
    //   }

    //   this.labelingTaskWait = false;
    // }));
    return this.labelingTasks$.pipe(first());
  }

  getLabelingTasks(projectID: string): Observable<any>{
    [this.labelingTasksQuery$, this.labelingTasks$] = this.projectApolloService.getLabelingTasksByProjectId(projectID);
    this.labelingTasks$.subscribe((tasks) => {
      tasks.forEach(element => {
        if (element.taskType === "MULTICLASS_CLASSIFICATION")
        {
          // console.log(element);
          this.labelingTaskColumns.push(element);
          if (element.informationSources.length > 0){
            element.informationSources.forEach(infSOurce => {
              // console.log(infSOurce);
              // console.log(infSOurce.type);
              if (infSOurce.type === InformationSourceType.ACTIVE_LEARNING){
                this.predictionsColumns.push(infSOurce);
              }
            });

          }
        }
      });
    });
    return this.labelingTasks$.pipe(first());

  }

  generateColumns(): Array<any>{
    const columns: Column[] = [];
    this.sortOrder.forEach((attribute) => {
      // console.log(attribute);
      columns.push({
        columnDef: attribute.key as string,
        header: attribute.key as string,
        isSort: true,
        isPrimaryKey: attribute.isPrimaryKey,
        classStyle: "attribute " + attribute.key,
        columnType: ColumnType.DATA_POINT,
        dataType: attribute.dataType,
        id: attribute.id
      });
    });
    this.labelingTaskColumns.forEach((labelingTask) => {
      // console.log(labelingTask);
      if (labelingTask.labels && labelingTask.labels.length > 3){
        window.alert("too many labels in one task, please, select less than four labels per task");
        throw Error("too many labels per task");
      }
      if (labelingTask.labels){
        labelingTask.labels.forEach(element => {
          if (element.name.length >= 7)
          {
            window.alert("label name is too long for display, please use a shorter name");
            throw Error("label name is too long");
          }
        });
      }
      columns.push({
        columnDef: labelingTask.name as string,
        header: labelingTask.name as string,
        isSort: false,
        isPrimaryKey: false,
        classStyle: "labelingTask " + labelingTask.name,
        columnType: ColumnType.LABELING_TASK,
        dataType: DataType.UNKNOWN,
        parent: labelingTask,
        id: labelingTask.id,
        labels: labelingTask.labels
      });
    });
    this.predictionsColumns.forEach((prediction => {
      // console.log(prediction);
      columns.push({
        columnDef: prediction.name as string,
        header: prediction.name as string,
        isSort: false,
        isPrimaryKey: false,
        classStyle: "prediction " + prediction.name,
        columnType: ColumnType.PREDICTION,
        dataType: DataType.UNKNOWN,
        parent: prediction,
        id: prediction.id,
      });
    }));
    // console.log(columns);
    return columns;

  }

  async requestRecordIds(projectId: string, sessionId: string): Promise<void> {
    const requestedPos = 0;
    const result = await this.recordApolloService.getSessionBySessionId(projectId, sessionId)
      .pipe(first()).toPromise();
    this.sessionData = {
      recordIds: result.sessionRecordIds as string[],
      partial: false,
      sessionId: result.sessionId,
      currentIndex: requestedPos,
      projectId: projectId,
    };
    // localStorage.setItem('sessionData', JSON.stringify(this.sessionData));
    // console.log(this.sessionData);
  }
  async labelClick(row: any, label: any, labelingTask: any): Promise<void>{
    // console.log(row);
    // console.log(labelingTask);
    // console.log(label);
    if (row[labelingTask.columnDef]?.labelId === label.id){
      console.log("entrou");
      let response = await this.deleteRecordLabelAssociation(row._id, row[labelingTask.columnDef].rlasId);
      console.log(response);
      row[labelingTask.columnDef] = undefined;

    }
    else{
      await this.addLabelToTask(row, labelingTask.id, label.id);
      await this.colletRecordData(this.project.id, row);
    }
  }

  async addLabelToTask(recordData: any, labelingTaskId: string, labelId: string) {

    await this.recordApolloService
      .addClassificationLabelsToRecord(
        this.project.id,
        recordData._id,
        labelingTaskId,
        labelId,
        // gold user thing
        null
      )
      .pipe(first()).toPromise();
  }

  async deleteRecordLabelAssociation(recordId: string , associationId: string) {
    console.log(this.project.id);
    return this.recordApolloService
      .deleteRecordLabelAssociationById(
        this.project.id,
        recordId,
        [associationId]
      ).pipe(first()).toPromise();
    // if (this.loggedInUser.id != this.displayUserId) {
    //   if (this.fullRecordData.recordLabelAssociations.length == 0 ||
    //     (this.fullRecordData.recordLabelAssociations.length == 1 && this.fullRecordData.recordLabelAssociations[0].id == associationId)) {
    //     this.showUserData(this.loggedInUser.id);
    //   }
    // }
  }


  // styling functions for buttons
  getBackground(color: any): string {
    return `bg-${color}-100 `;
  }

  getText(color: any): string {
    return `text-${color}-700 `;
  }

  getBorder(color: any): string {
    return `border-${color}-400 `;
  }

  getHover(color: any): string {
    return `hover:bg-${color}-200 `;
  }
  getShadow(color: string): string{
    return `shadow-${color}-500/50 `;
  }
  getLabelForDisplay(labelName: string, confidence: number): string {
    return (
      labelName +
      (confidence || confidence == 0
        ? ' - ' + Math.round((confidence + Number.EPSILON) * 10000) / 100 + '%'
        : '')
    );
  }
}
