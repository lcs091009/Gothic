import {Component,createElement} from "react";

export default class PageErrorBoundary extends Component {
  state={failed:false};
  static getDerivedStateFromError() {return {failed:true};}
  render() {
    return this.state.failed ? createElement("p",{role:"alert"},
      "화면을 불러오지 못했습니다. 다른 메뉴에서 입력 내용을 확인하고 저장한 뒤 새로고침해 주세요.") : this.props.children;
  }
}
