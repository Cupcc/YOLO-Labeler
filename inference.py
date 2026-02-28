import sys
import json
import os
from ultralytics import YOLO

# 强制使用 UTF-8 编码，防止中文路径乱码
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')

def main():
    model = None
    
    while True:
        try:
            # 等待 Electron 发送指令
            line = sys.stdin.readline()
            if not line:
                break
            
            data = json.loads(line.strip())
            command = data.get('command')
            
            request_id = data.get('id')
            
            if command == 'load_model':
                model_path = data.get('path')
                try:
                    model = YOLO(model_path)
                    # 获取模型类别名称
                    class_names = model.names if hasattr(model, 'names') else {}
                    # 将类别名称转换为列表（按索引排序）
                    class_list = [class_names.get(i, f'class_{i}') for i in range(len(class_names))]
                    print(json.dumps({
                        "status": "success",
                        "id": request_id,
                        "message": "Model loaded",
                        "classes": class_list
                    }))
                except Exception as e:
                    print(json.dumps({"status": "error", "id": request_id, "message": str(e)}))
                sys.stdout.flush()
                
            elif command == 'detect':
                if model is None:
                    print(json.dumps({"status": "error", "id": request_id, "message": "Model not loaded"}))
                else:
                    image_path = data.get('image_path')
                    conf_thres = data.get('conf', 0.25)
                    
                    # 运行推理
                    results = model.predict(image_path, conf=conf_thres, save=False, verbose=False)
                    
                    detections = []
                    for result in results:
                        for box in result.boxes:
                            # 转换为 YOLO 格式: class_id, x_center, y_center, width, height (归一化)
                            cls_id = int(box.cls[0])
                            # xywhn 已经是归一化的 center_x, center_y, width, height
                            x, y, w, h = box.xywhn[0].tolist()
                            
                            detections.append({
                                "classId": cls_id,
                                "xCenter": x,
                                "yCenter": y,
                                "width": w,
                                "height": h,
                                "confidence": float(box.conf[0])
                            })
                    
                    print(json.dumps({"status": "success", "id": request_id, "data": detections}))
                sys.stdout.flush()
                
        except json.JSONDecodeError:
            continue
        except Exception as e:
            # 捕获所有未预料的错误，防止进程崩溃
            print(json.dumps({"status": "error", "id": None, "message": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()