export const extraConstructorMap: {
  [className: string]: {
    constructors: Array<
      Array<{
        type: string;
        param: string;
      }>
    >;
  };
} = {
  "Scene": {
    "constructors": [
      [
        { "type": "Parent", "param": "root" },
        { "type": "double", "param": "width" },
        { "type": "double", "param": "height" },
        { "type": "boolean", "param": "depthBuffer" },
        { "type": "SceneAntialiasing", "param": "antiAliasing" }
      ],
      [
        { "type": "Parent", "param": "root" },
        { "type": "double", "param": "width" },
        { "type": "double", "param": "height" },
        { "type": "boolean", "param": "depthBuffer" }
      ],
      [
        { "type": "Parent", "param": "root" },
        { "type": "double", "param": "width" },
        { "type": "double", "param": "height" },
        { "type": "Paint", "param": "fill" }
      ],
      [
        { "type": "Parent", "param": "root" },
        { "type": "double", "param": "width" },
        { "type": "double", "param": "height" }
      ],
      [
        { "type": "Parent", "param": "root" },
        { "type": "Paint", "param": "fill" }
      ],
      [
        { "type": "Parent", "param": "root" }
      ]
    ]
  },
  "Media": {
    "constructors": [
      [
        { "type": "String", "param": "source" }
      ]
    ]
  }
};




